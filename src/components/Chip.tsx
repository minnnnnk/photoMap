import { Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  label: string;
  selected?: boolean;
  /** 점선 테두리 (예: "+ 새 앨범") */
  dashed?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

/** 앨범 고르기 등에 쓰는 동그란 버튼 */
export function Chip({ label, selected = false, dashed = false, onPress, onLongPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        dashed && styles.dashed,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    maxWidth: 200,
    marginRight: 8,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7dce4',
    backgroundColor: '#fff',
  },
  selected: {
    borderColor: '#2f6bff',
    backgroundColor: '#2f6bff',
  },
  dashed: {
    borderStyle: 'dashed',
    borderColor: '#9aa1ad',
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b4250',
  },
  selectedLabel: {
    color: '#fff',
  },
});
