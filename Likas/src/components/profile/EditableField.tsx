import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { COLORS, FONTS, SIZES } from '../../theme';

interface Props {
  label: string;
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  multiline?: boolean;
}

export const EditableField: React.FC<Props> = ({
  label,
  value,
  onSave,
  placeholder = '',
  keyboardType = 'default',
  multiline = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleEdit = () => {
    setDraft(value);
    setIsEditing(true);
  };

  const handleSave = () => {
    onSave(draft.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      {isEditing ? (
        <View style={styles.editingRow}>
          <TextInput
            style={[styles.input, multiline && styles.inputMultiline]}
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={COLORS.gray}
            keyboardType={keyboardType}
            autoFocus
            multiline={multiline}
            returnKeyType={multiline ? 'default' : 'done'}
            onSubmitEditing={multiline ? undefined : handleSave}
          />
          <View style={styles.editButtons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>✓ Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.displayRow}
          onPress={handleEdit}
          activeOpacity={0.7}
        >
          <Text style={[styles.displayValue, !value && styles.displayEmpty]}>
            {value || placeholder || 'Tap to edit'}
          </Text>
          <Text style={styles.editIcon}>✏️</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  label: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.lightGreen,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  displayValue: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    flex: 1,
  },
  displayEmpty: {
    color: COLORS.gray,
    fontStyle: 'italic',
  },
  editIcon: {
    fontSize: 14,
    marginLeft: 8,
  },
  editingRow: {
    gap: 6,
  },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primaryGreen,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: COLORS.lightGreen,
    borderRadius: 8,
  },
  cancelText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.gray,
  },
  saveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: COLORS.primaryGreen,
    borderRadius: 8,
  },
  saveText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.white,
  },
});

export default EditableField;
