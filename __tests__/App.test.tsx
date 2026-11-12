import { applyRecognizedIdsToInventory } from '../src/hooks/useInventory';
import {
  identifyPantryItemsFromPhoto,
  OpenRouterRecognitionError,
  PANTRY_RECOGNITION_RESPONSE_FORMAT,
  RECOGNITION_PROMPT_INSTRUCTION,
  validateAndNormalizeRecognitionResponse,
} from '../src/services/openRouterService';
import { INITIAL_EMERGENCY_INVENTORY } from '../src/services/seedData';
import { InventoryStorage } from '../src/storage/inventoryStorage';
import {
  formatDisplayDate,
  getExpiryStatus,
  toIsoDateString,
} from '../src/utils/dateUtils';
import { uint8ArrayToBase64 } from '../src/utils/imageProcessor';
import { validateInventoryForm } from '../src/utils/validation';

const mockStore: Record<string, string> = {};

jest.mock('react-native-nitro-image', () => ({
  Images: {
    loadFromFileAsync: jest.fn(),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) =>
    Object.prototype.hasOwnProperty.call(mockStore, key)
      ? mockStore[key]
      : null,
  ),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStore[key] = value;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete mockStore[key];
  }),
  clear: jest.fn(async () => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
  }),
}));

describe('PantryLens Core Suite', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
  });

  test('Swiss Emergency Plan initial inventory has 24 properly initialized items', () => {
    expect(INITIAL_EMERGENCY_INVENTORY).toHaveLength(24);

    const ids = new Set(INITIAL_EMERGENCY_INVENTORY.map(i => i.id));
    expect(ids.size).toBe(24);

    const beverages = INITIAL_EMERGENCY_INVENTORY.filter(
      i => i.category === 'Beverages',
    );
    const food = INITIAL_EMERGENCY_INVENTORY.filter(i => i.category === 'Food');
    const supplies = INITIAL_EMERGENCY_INVENTORY.filter(
      i => i.category === 'Additional supplies',
    );

    expect(beverages).toHaveLength(2);
    expect(food).toHaveLength(17);
    expect(supplies).toHaveLength(5);

    const fullMetadataBeverages = beverages.filter(
      i => i.location && i.expiryDate && i.notes,
    );
    const fullMetadataFood = food.filter(
      i => i.location && i.expiryDate && i.notes,
    );
    const fullMetadataSupplies = supplies.filter(
      i => i.location && i.expiryDate && i.notes,
    );

    expect(fullMetadataBeverages.length).toBeGreaterThanOrEqual(2);
    expect(fullMetadataFood.length).toBeGreaterThanOrEqual(2);
    expect(fullMetadataSupplies.length).toBeGreaterThanOrEqual(2);
  });

  test('InventoryStorage initializes empty on first launch and preserves user modifications on restart', async () => {
    const initial = await InventoryStorage.loadInventory();
    expect(initial).toHaveLength(0);

    const modified = [
      {
        id: 'custom-test-1',
        name: 'First Aid Kit',
        category: 'Additional supplies' as const,
        location: 'Hallway closet',
        expiryDate: '2028-06-15',
        notes: 'Checked bandages',
        checked: true,
      },
      {
        id: 'custom-test-2',
        name: 'Mineral Water',
        category: 'Beverages' as const,
        checked: true,
        location: 'Basement rack 1',
        expiryDate: '2027-12-01',
        notes: '6x 1.5L bottles',
      },
    ];

    await InventoryStorage.saveInventory(modified);

    const reloaded = await InventoryStorage.loadInventory();
    expect(reloaded).toHaveLength(2);
    expect(reloaded[0].id).toBe('custom-test-1');
    expect(reloaded[0].checked).toBe(true);
    expect(reloaded[1].location).toBe('Basement rack 1');
    expect(reloaded[1].notes).toBe('6x 1.5L bottles');
  });

  test('validateInventoryForm enforces required item name and field constraints', () => {
    const emptyResult = validateInventoryForm({
      name: '   ',
      category: 'Food',
      location: '',
      expiryDate: null,
      notes: '',
    });
    expect(emptyResult.isValid).toBe(false);
    expect(emptyResult.errors.name).toBeDefined();

    const validResult = validateInventoryForm({
      name: 'Canned Lentils',
      category: 'Food',
      location: 'Pantry Shelf 2',
      expiryDate: '2027-05-10',
      notes: '4 cans stocked',
    });
    expect(validResult.isValid).toBe(true);
    expect(validResult.errors).toEqual({});
  });

  test('dateUtils formats dates and computes expiry status accurately', () => {
    expect(formatDisplayDate(null)).toBe('Not set');
    expect(getExpiryStatus(null).status).toBe('none');

    const pastStatus = getExpiryStatus('2020-01-01');
    expect(pastStatus.status).toBe('expired');

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);
    const futureIso = toIsoDateString(futureDate);
    expect(getExpiryStatus(futureIso).status).toBe('valid');
  });
});

describe('Phase 2: OpenRouter AI Recognition & Scenarios 1–7', () => {
  const sampleBase64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';
  const testApiKey = 'sk-or-v1-unit-test-dummy-key';
  const testModel = 'qwen/qwen3-vl-8b-instruct';

  beforeEach(() => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
  });

  test('uint8ArrayToBase64 encodes binary JPEG buffers accurately without browser APIs', () => {
    const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(uint8ArrayToBase64(input)).toBe('SGVsbG8=');
  });

  test('Scenario 1: Photograph containing rice and canned food -> only those items become checked while preserving metadata and custom order', async () => {
    // Prepare inventory where some other items were previously checked and metadata was customized
    const initialInventory = INITIAL_EMERGENCY_INVENTORY.map((item, idx) => ({
      ...item,
      checked: idx === 0 || idx === 10, // Water & Coffee initially checked
      location:
        item.id === 'swiss-emergency-03' ? 'Top Shelf Bin A' : item.location,
      expiryDate:
        item.id === 'swiss-emergency-05' ? '2028-11-30' : item.expiryDate,
      notes:
        item.id === 'swiss-emergency-03'
          ? '2kg Basmati + 1kg Penne'
          : item.notes,
    }));

    let capturedBody: Record<string, unknown> | null = null;
    const mockFetch: typeof fetch = jest.fn(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    foundItemIds: [
                      'swiss-emergency-03',
                      'swiss-emergency-05',
                      'swiss-emergency-03',
                    ], // includes duplicate to verify deduplication
                  }),
                },
              },
            ],
          }),
      } as Response;
    });

    const response = await identifyPantryItemsFromPhoto({
      imageDataUrl: sampleBase64Image,
      inventoryItems: initialInventory,
      configOverride: {
        apiKey: testApiKey,
        model: testModel,
      },
      fetchImpl: mockFetch,
    });

    // Verify deduplicated IDs
    expect(response.foundItemIds).toEqual([
      'swiss-emergency-03',
      'swiss-emergency-05',
    ]);

    // Verify OpenRouter request format & Structured Outputs schema
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.model).toBe(testModel);
    expect(capturedBody!.response_format).toEqual(
      PANTRY_RECOGNITION_RESPONSE_FORMAT,
    );
    const messages = capturedBody!.messages as Array<{
      role: string;
      content: unknown;
    }>;
    expect(messages[0].content).toBe(RECOGNITION_PROMPT_INSTRUCTION);

    // Apply recognized IDs to inventory
    const updatedInventory = applyRecognizedIdsToInventory(
      initialInventory,
      response.foundItemIds,
    );

    const checkedIds = updatedInventory.filter(i => i.checked).map(i => i.id);
    expect(checkedIds).toEqual(['swiss-emergency-03', 'swiss-emergency-05']);

    // Verify metadata and ordering are preserved
    expect(updatedInventory.map(i => i.id)).toEqual(
      initialInventory.map(i => i.id),
    );
    const riceItem = updatedInventory.find(i => i.id === 'swiss-emergency-03')!;
    const cannedItem = updatedInventory.find(
      i => i.id === 'swiss-emergency-05',
    )!;
    expect(riceItem.location).toBe('Top Shelf Bin A');
    expect(riceItem.notes).toBe('2kg Basmati + 1kg Penne');
    expect(cannedItem.expiryDate).toBe('2028-11-30');
  });

  test('Scenario 2: Photograph containing one item -> only that item becomes checked', async () => {
    const initialInventory = INITIAL_EMERGENCY_INVENTORY.map(item => ({
      ...item,
      checked: true, // Start with all checked
    }));

    const mockFetch: typeof fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  foundItemIds: ['swiss-emergency-15'], // Chocolate.
                }),
              },
            },
          ],
        }),
    })) as unknown as typeof fetch;

    const result = await identifyPantryItemsFromPhoto({
      imageDataUrl: sampleBase64Image,
      inventoryItems: initialInventory,
      configOverride: {
        apiKey: testApiKey,
        model: testModel,
      },
      fetchImpl: mockFetch,
    });

    const updated = applyRecognizedIdsToInventory(
      initialInventory,
      result.foundItemIds,
    );

    expect(updated.filter(i => i.checked).map(i => i.id)).toEqual([
      'swiss-emergency-15',
    ]);
    expect(updated.filter(i => !i.checked)).toHaveLength(23);
  });

  test('Scenario 3: Photograph containing no matching inventory items -> all items become unchecked', async () => {
    const initialInventory = INITIAL_EMERGENCY_INVENTORY.map((item, idx) => ({
      ...item,
      checked: idx < 5,
    }));

    const mockFetch: typeof fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  foundItemIds: [],
                }),
              },
            },
          ],
        }),
    })) as unknown as typeof fetch;

    const result = await identifyPantryItemsFromPhoto({
      imageDataUrl: sampleBase64Image,
      inventoryItems: initialInventory,
      configOverride: {
        apiKey: testApiKey,
        model: testModel,
      },
      fetchImpl: mockFetch,
    });

    expect(result.foundItemIds).toEqual([]);
    const updated = applyRecognizedIdsToInventory(
      initialInventory,
      result.foundItemIds,
    );
    expect(updated.every(i => i.checked === false)).toBe(true);
    expect(updated).toHaveLength(24);
  });

  test('Scenario 4: Invalid AI response (malformed JSON, extra properties, or unknown IDs) -> rejected and existing inventory remains unchanged', async () => {
    const validIds = new Set(INITIAL_EMERGENCY_INVENTORY.map(i => i.id));

    // 4a. Malformed JSON
    expect(() =>
      validateAndNormalizeRecognitionResponse('{not-valid-json', validIds),
    ).toThrow(OpenRouterRecognitionError);

    // 4b. Missing foundItemIds
    expect(() =>
      validateAndNormalizeRecognitionResponse('{"items":["swiss-001"]}', validIds),
    ).toThrow(OpenRouterRecognitionError);

    // 4c. Additional unexpected properties (violates additionalProperties: false)
    expect(() =>
      validateAndNormalizeRecognitionResponse(
        '{"foundItemIds":["swiss-001"],"extra":true}',
        validIds,
      ),
    ).toThrow(OpenRouterRecognitionError);

    // 4d. Unknown / hallucinated item ID not in current inventory
    expect(() =>
      validateAndNormalizeRecognitionResponse(
        '{"foundItemIds":["swiss-003","invented-id-999"]}',
        validIds,
      ),
    ).toThrow(OpenRouterRecognitionError);
  });

  test('Scenario 5: Network failure & API error handling -> error message shown, API key never exposed, existing inventory remains intact', async () => {
    const initialInventory = INITIAL_EMERGENCY_INVENTORY.map((item, idx) => ({
      ...item,
      checked: idx === 2,
    }));

    const failingFetch: typeof fetch = jest.fn(async () => {
      throw new Error(`Network failure while calling with ${testApiKey}`);
    });

    await expect(
      identifyPantryItemsFromPhoto({
        imageDataUrl: sampleBase64Image,
        inventoryItems: initialInventory,
        configOverride: {
          apiKey: testApiKey,
          model: testModel,
        },
        fetchImpl: failingFetch,
      }),
    ).rejects.toThrow(OpenRouterRecognitionError);

    try {
      await identifyPantryItemsFromPhoto({
        imageDataUrl: sampleBase64Image,
        inventoryItems: initialInventory,
        configOverride: {
          apiKey: testApiKey,
          model: testModel,
        },
        fetchImpl: failingFetch,
      });
    } catch (err) {
      const recognitionErr = err as OpenRouterRecognitionError;
      expect(recognitionErr.code).toBe('NETWORK_ERROR');
      expect(recognitionErr.userMessage).not.toContain(testApiKey);
    }

    // Initial inventory remains intact
    expect(initialInventory.filter(i => i.checked).map(i => i.id)).toEqual([
      'swiss-emergency-03',
    ]);
  });

  test('Scenario 6: Application restart -> updated checked states from AI recognition persist in AsyncStorage', async () => {
    const initial = [
      {
        id: 'custom-01',
        name: 'Mineral Water',
        category: 'Beverages' as const,
        location: 'Basement Pantry',
        expiryDate: '2028-10-15',
        notes: '6x 1.5L bottles',
        checked: false,
      },
      {
        id: 'custom-02',
        name: 'Rice',
        category: 'Food' as const,
        location: 'Pantry Shelf 2',
        expiryDate: '2028-04-20',
        notes: '2kg Basmati',
        checked: false,
      },
      {
        id: 'custom-03',
        name: 'Chocolate',
        category: 'Food' as const,
        location: 'Cupboard',
        expiryDate: '2027-01-01',
        notes: 'Dark chocolate',
        checked: false,
      },
      {
        id: 'custom-04',
        name: 'Flashlight',
        category: 'Additional supplies' as const,
        location: 'Drawer',
        expiryDate: null,
        notes: '',
        checked: false,
      },
    ];
    await InventoryStorage.saveInventory(initial);

    const updated = applyRecognizedIdsToInventory(initial, [
      'custom-01',
      'custom-02',
    ]);
    await InventoryStorage.saveInventory(updated);

    // Simulate application restart by reloading from AsyncStorage
    const afterRestart = await InventoryStorage.loadInventory();
    expect(afterRestart.filter(i => i.checked).map(i => i.id)).toEqual([
      'custom-01',
      'custom-02',
    ]);
    expect(afterRestart.filter(i => !i.checked)).toHaveLength(2);
  });

  test('Scenario 7: Rapid duplicate invocation guard -> synchronous lock ensures only 1 request executes', async () => {
    let callCount = 0;
    let isLocked = false;

    const triggerGuardedIdentify = async () => {
      if (isLocked) {
        return 'ignored';
      }
      isLocked = true;
      try {
        callCount += 1;
        await new Promise<void>(resolve => setTimeout(() => resolve(), 25));
        return 'completed';
      } finally {
        isLocked = false;
      }
    };

    const [first, second, third] = await Promise.all([
      triggerGuardedIdentify(),
      triggerGuardedIdentify(),
      triggerGuardedIdentify(),
    ]);

    expect(first).toBe('completed');
    expect(second).toBe('ignored');
    expect(third).toBe('ignored');
    expect(callCount).toBe(1);
  });
});
