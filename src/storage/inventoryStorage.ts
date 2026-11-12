import AsyncStorage from '@react-native-async-storage/async-storage';
import { InventoryItem } from '../models/inventory';
import { INITIAL_EMERGENCY_INVENTORY } from '../services/seedData';

const STORAGE_KEYS = {
  INVENTORY_ITEMS: '@pantrylens:inventory_items_v1',
  SEED_INITIALIZED: '@pantrylens:seed_initialized_v1',
};

export const InventoryStorage = {
  /**
   * Loads the inventory from AsyncStorage.
   * Cleans out any legacy demo/seed items so that only user-added items are kept.
   * If no inventory exists, initializes with an empty list.
   */
  async loadInventory(): Promise<InventoryItem[]> {
    try {
      const [rawItems, isSeeded] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.INVENTORY_ITEMS),
        AsyncStorage.getItem(STORAGE_KEYS.SEED_INITIALIZED),
      ]);

      if (rawItems !== null) {
        let parsed = JSON.parse(rawItems);
        if (Array.isArray(parsed)) {
          // Remove any demo/seed items so only original user-added items remain
          const userItems = parsed.filter(
            (item: InventoryItem) => !item.id?.startsWith('swiss-emergency-'),
          );

          if (userItems.length !== parsed.length) {
            await AsyncStorage.setItem(
              STORAGE_KEYS.INVENTORY_ITEMS,
              JSON.stringify(userItems),
            );
          }

          if (!isSeeded) {
            await AsyncStorage.setItem(STORAGE_KEYS.SEED_INITIALIZED, 'true');
          }
          return userItems as InventoryItem[];
        }
      }

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.INVENTORY_ITEMS, JSON.stringify([])),
        AsyncStorage.setItem(STORAGE_KEYS.SEED_INITIALIZED, 'true'),
      ]);
      return [];
    } catch (error) {
      console.error('Failed to load inventory from AsyncStorage:', error);
      return [];
    }
  },

  /**
   * Persists the current ordered inventory array to AsyncStorage.
   */
  async saveInventory(items: InventoryItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.INVENTORY_ITEMS,
        JSON.stringify(items),
      );
    } catch (error) {
      console.error('Failed to save inventory to AsyncStorage:', error);
    }
  },

  /**
   * Clears all items in the inventory.
   */
  async clearInventory(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.INVENTORY_ITEMS,
        JSON.stringify([]),
      );
    } catch (error) {
      console.error('Failed to clear inventory in AsyncStorage:', error);
    }
  },

  /**
   * Restores the default Swiss Emergency Plan checklist if the user explicitly requests a reset.
   */
  async resetToDefaultSeed(): Promise<InventoryItem[]> {
    try {
      await Promise.all([
        AsyncStorage.setItem(
          STORAGE_KEYS.INVENTORY_ITEMS,
          JSON.stringify(INITIAL_EMERGENCY_INVENTORY),
        ),
        AsyncStorage.setItem(STORAGE_KEYS.SEED_INITIALIZED, 'true'),
      ]);
      return INITIAL_EMERGENCY_INVENTORY;
    } catch (error) {
      console.error('Failed to reset inventory in AsyncStorage:', error);
      return INITIAL_EMERGENCY_INVENTORY;
    }
  },
};

