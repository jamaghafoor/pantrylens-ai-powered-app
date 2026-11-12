import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {
  INVENTORY_CATEGORIES,
  InventoryCategory,
  InventoryItem,
  InventoryItemFormValues,
} from '../models/inventory';
import { BorderRadius, Colors, Fonts, Shadows, Spacing } from '../theme';
import {
  formatDisplayDate,
  parseIsoDate,
  toIsoDateString,
} from '../utils/dateUtils';
import {
  ValidationErrors,
  validateInventoryForm,
} from '../utils/validation';

interface ItemFormModalProps {
  visible: boolean;
  editingItem: InventoryItem | null;
  defaultCategory?: InventoryCategory;
  onClose: () => void;
  onSubmit: (values: InventoryItemFormValues) => void;
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  visible,
  editingItem,
  defaultCategory = 'Food',
  onClose,
  onSubmit,
}) => {
  const { height: windowHeight } = useWindowDimensions();
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<InventoryCategory>(defaultCategory);
  const [location, setLocation] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);

  const scrollViewRef = useRef<any>(null);
  const isKeyboardVisible = keyboardHeight > 0;

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      if (editingItem) {
        setName(editingItem.name);
        setCategory(editingItem.category);
        setLocation(editingItem.location);
        setExpiryDate(editingItem.expiryDate);
        setNotes(editingItem.notes);
      } else {
        setName('');
        setCategory(defaultCategory);
        setLocation('');
        setExpiryDate(null);
        setNotes('');
      }
      setErrors({});
      setShowDatePicker(false);
    }
  }, [visible, editingItem, defaultCategory]);

  const handleFocusField = (field: 'name' | 'location' | 'notes') => {
    setTimeout(() => {
      if (field === 'name') {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      } else if (field === 'location') {
        scrollViewRef.current?.scrollTo({ y: 120, animated: true });
      } else if (field === 'notes') {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }
    }, 120);
  };

  const handleDateChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    setShowDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      setExpiryDate(toIsoDateString(selectedDate));
    }
  };

  const handleSave = () => {
    const formValues: InventoryItemFormValues = {
      name,
      category,
      location,
      expiryDate,
      notes,
    };

    const validation = validateInventoryForm(formValues);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    onSubmit(formValues);
    onClose();
  };

  // Dynamically calculate the maximum bottom sheet height so it never exceeds visible screen space above keyboard
  const maxSheetHeight = isKeyboardVisible
    ? Math.max(280, windowHeight - keyboardHeight - (Platform.OS === 'android' ? 28 : 50))
    : Math.round(windowHeight * 0.88);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View
        style={[
          styles.overlay,
          isKeyboardVisible ? { paddingBottom: keyboardHeight } : null,
        ]}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (isKeyboardVisible) {
              Keyboard.dismiss();
            } else {
              onClose();
            }
          }}
        />

        <View style={[styles.sheet, { maxHeight: maxSheetHeight }]}>
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.sheetTitle}>
              {editingItem ? 'Edit Inventory Item' : 'Add New Supply Item'}
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.formScroll}
            contentContainerStyle={styles.formScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}>
            {/* 1. Item Name (Required) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                1. Item Name <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  errors.name ? styles.textInputError : null,
                ]}
                placeholder="e.g., Bottled mineral water (9L)"
                placeholderTextColor={Colors.textMuted}
                value={name}
                onFocus={() => handleFocusField('name')}
                onChangeText={text => {
                  setName(text);
                  if (errors.name) {
                    setErrors(prev => ({ ...prev, name: undefined }));
                  }
                }}
                maxLength={140}
                testID="input-item-name"
              />
              {errors.name ? (
                <Text style={styles.errorText}>{errors.name}</Text>
              ) : null}
            </View>

            {/* Category Selector */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.categoryOptionsRow}>
                {INVENTORY_CATEGORIES.map(cat => {
                  const selected = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryOption,
                        selected ? styles.categoryOptionSelected : null,
                      ]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setCategory(cat);
                      }}
                      activeOpacity={0.8}>
                      <Text
                        style={[
                          styles.categoryOptionText,
                          selected ? styles.categoryOptionTextSelected : null,
                        ]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 2. Location (Text Input) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>2. Location</Text>
              <TextInput
                style={[
                  styles.textInput,
                  errors.location ? styles.textInputError : null,
                ]}
                placeholder="e.g., Basement shelf B, Kitchen pantry"
                placeholderTextColor={Colors.textMuted}
                value={location}
                onFocus={() => handleFocusField('location')}
                onChangeText={text => {
                  setLocation(text);
                  if (errors.location) {
                    setErrors(prev => ({ ...prev, location: undefined }));
                  }
                }}
                maxLength={100}
                testID="input-item-location"
              />
              {errors.location ? (
                <Text style={styles.errorText}>{errors.location}</Text>
              ) : null}
            </View>

            {/* 3. Expiry Date (Date Picker) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>3. Expiry Date</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowDatePicker(true);
                  }}
                  activeOpacity={0.8}
                  testID="button-open-datepicker">
                  <Text style={styles.dateIcon}>📅</Text>
                  <Text
                    style={[
                      styles.dateValueText,
                      !expiryDate ? styles.datePlaceholderText : null,
                    ]}>
                    {expiryDate
                      ? formatDisplayDate(expiryDate)
                      : 'Select expiry date (optional)'}
                  </Text>
                </TouchableOpacity>

                {expiryDate ? (
                  <TouchableOpacity
                    style={styles.clearDateButton}
                    onPress={() => setExpiryDate(null)}
                    activeOpacity={0.8}>
                    <Text style={styles.clearDateText}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {showDatePicker ? (
                <DateTimePicker
                  value={parseIsoDate(expiryDate)}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                />
              ) : null}
            </View>

            {/* 4. Notes (Multiline Input) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>4. Notes</Text>
              <TextInput
                style={[
                  styles.textInput,
                  styles.multilineInput,
                  errors.notes ? styles.textInputError : null,
                ]}
                placeholder="Add quantity details, rotation reminders, or special instructions..."
                placeholderTextColor={Colors.textMuted}
                value={notes}
                onFocus={() => handleFocusField('notes')}
                onChangeText={text => {
                  setNotes(text);
                  if (errors.notes) {
                    setErrors(prev => ({ ...prev, notes: undefined }));
                  }
                }}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
                testID="input-item-notes"
              />
              {errors.notes ? (
                <Text style={styles.errorText}>{errors.notes}</Text>
              ) : null}
            </View>
          </ScrollView>

          {/* Submit / Cancel Footer */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              activeOpacity={0.8}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              activeOpacity={0.85}
              testID="button-save-item">
              <Text style={styles.saveButtonText}>
                {editingItem ? 'Save Changes' : 'Add to Pantry'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.modalOverlay,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    ...Shadows.floating,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontFamily: Fonts.bold,
    fontSize: 19,
    color: Colors.navyPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  closeBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  formScroll: {
    flexShrink: 1,
    marginBottom: Spacing.xs,
  },
  formScrollContent: {
    paddingBottom: Spacing.md,
  },
  fieldGroup: {
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: Colors.navyPrimary,
    marginBottom: Spacing.xs,
  },
  requiredStar: {
    color: Colors.danger,
  },
  textInput: {
    fontFamily: Fonts.regular,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    fontSize: 14.5,
    color: Colors.textPrimary,
  },
  textInputError: {
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerSoft,
  },
  multilineInput: {
    minHeight: 96,
    paddingTop: 12,
  },
  errorText: {
    fontFamily: Fonts.medium,
    color: Colors.danger,
    fontSize: 12,
    marginTop: 5,
  },
  categoryOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  categoryOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryOptionSelected: {
    backgroundColor: Colors.navyPrimary,
    borderColor: Colors.navyPrimary,
  },
  categoryOptionText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  categoryOptionTextSelected: {
    color: Colors.textOnPrimary,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  datePickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
  },
  dateIcon: {
    fontSize: 16,
    marginRight: Spacing.sm,
  },
  dateValueText: {
    fontFamily: Fonts.medium,
    fontSize: 14.5,
    color: Colors.textPrimary,
  },
  datePlaceholderText: {
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  clearDateButton: {
    backgroundColor: Colors.navySoft,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    borderRadius: BorderRadius.md,
  },
  clearDateText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.navyPrimary,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 14.5,
    color: Colors.textSecondary,
  },
  saveButton: {
    flex: 2,
    backgroundColor: Colors.greenPrimary,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: Fonts.bold,
    fontSize: 14.5,
    color: Colors.textOnPrimary,
  },
});
