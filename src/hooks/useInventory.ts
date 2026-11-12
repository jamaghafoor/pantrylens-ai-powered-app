import { useCallback, useEffect, useRef, useState } from 'react';
import {
  InventoryItem,
  InventoryItemFormValues,
} from '../models/inventory';
import { InventoryStorage } from '../storage/inventoryStorage';
import { generateUniqueId } from '../utils/idGenerator';

/**
 * Pure helper that applies validated AI recognition IDs to an inventory list:
 * - Items included in `foundItemIds` are marked as `checked: true`.
 * - All other items are marked as `checked: false`.
 * - Preserves all names, IDs, categories, locations, expiry dates, notes, and item ordering.
 */
export function applyRecognizedIdsToInventory(
  currentItems: InventoryItem[],
  foundItemIds: string[],
): InventoryItem[] {
  const foundSet = new Set(foundItemIds);
  return currentItems.map(item => ({
    ...item,
    checked: foundSet.has(item.id),
  }));
}

export function useInventoryState() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const isInitialLoadComplete = useRef<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    InventoryStorage.loadInventory()
      .then(loadedItems => {
        if (isMounted) {
          setItems(loadedItems);
          isInitialLoadComplete.current = true;
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const persistItems = useCallback((updatedItems: InventoryItem[]) => {
    setItems(updatedItems);
    if (isInitialLoadComplete.current) {
      InventoryStorage.saveInventory(updatedItems);
    }
  }, []);

  const addItem = useCallback(
    (values: InventoryItemFormValues): InventoryItem => {
      const newItem: InventoryItem = {
        id: generateUniqueId('custom'),
        name: values.name.trim(),
        category: values.category,
        location: values.location.trim(),
        expiryDate: values.expiryDate,
        notes: values.notes.trim(),
        checked: false,
      };
      setItems(prev => {
        const next = [newItem, ...prev];
        InventoryStorage.saveInventory(next);
        return next;
      });
      return newItem;
    },
    [],
  );

  const updateItem = useCallback(
    (id: string, values: InventoryItemFormValues): InventoryItem | null => {
      let updatedItemRef: InventoryItem | null = null;
      setItems(prev => {
        const next = prev.map(item => {
          if (item.id !== id) {
            return item;
          }
          const updated: InventoryItem = {
            ...item,
            name: values.name.trim(),
            category: values.category,
            location: values.location.trim(),
            expiryDate: values.expiryDate,
            notes: values.notes.trim(),
          };
          updatedItemRef = updated;
          return updated;
        });
        InventoryStorage.saveInventory(next);
        return next;
      });
      return updatedItemRef;
    },
    [],
  );

  const toggleItemChecked = useCallback((id: string) => {
    setItems(prev => {
      const next = prev.map(item =>
        item.id === id ? { ...item, checked: !item.checked } : item,
      );
      InventoryStorage.saveInventory(next);
      return next;
    });
  }, []);

  const deleteItem = useCallback((id: string) => {
    setItems(prev => {
      const next = prev.filter(item => item.id !== id);
      InventoryStorage.saveInventory(next);
      return next;
    });
  }, []);

  /**
   * Reorders items either across the full list or within a filtered subset while
   * preserving global ordering in AsyncStorage.
   */
  const reorderItems = useCallback(
    (
      fromIndex: number,
      toIndex: number,
      visibleList?: InventoryItem[],
    ) => {
      if (fromIndex === toIndex) {
        return;
      }

      setItems(prev => {
        if (!visibleList || visibleList.length === prev.length) {
          const copy = [...prev];
          const [moved] = copy.splice(fromIndex, 1);
          if (!moved) {
            return prev;
          }
          copy.splice(toIndex, 0, moved);
          InventoryStorage.saveInventory(copy);
          return copy;
        }

        const reorderedVisible = [...visibleList];
        const [movedItem] = reorderedVisible.splice(fromIndex, 1);
        if (!movedItem) {
          return prev;
        }
        reorderedVisible.splice(toIndex, 0, movedItem);

        const visibleIds = new Set(visibleList.map(i => i.id));
        let visibleCursor = 0;
        const next = prev.map(item => {
          if (visibleIds.has(item.id)) {
            const replacement = reorderedVisible[visibleCursor];
            visibleCursor += 1;
            return replacement;
          }
          return item;
        });

        InventoryStorage.saveInventory(next);
        return next;
      });
    },
    [],
  );

  /**
   * Updates the inventory checklist based on validated AI recognition item IDs:
   * - Items included in `foundItemIds` are marked checked.
   * - All other items are marked unchecked.
   * - Preserves all metadata and custom item ordering, and saves to AsyncStorage.
   */
  const applyRecognizedItems = useCallback((foundItemIds: string[]) => {
    setItems(prev => {
      const next = applyRecognizedIdsToInventory(prev, foundItemIds);
      InventoryStorage.saveInventory(next);
      return next;
    });
  }, []);

  const resetToDefault = useCallback(async () => {
    const defaultItems = await InventoryStorage.resetToDefaultSeed();
    setItems(defaultItems);
  }, []);

  const clearAllItems = useCallback(async () => {
    await InventoryStorage.clearInventory();
    setItems([]);
  }, []);

  return {
    items,
    isLoading,
    addItem,
    updateItem,
    toggleItemChecked,
    deleteItem,
    reorderItems,
    applyRecognizedItems,
    persistItems,
    resetToDefault,
    clearAllItems,
  };
}
