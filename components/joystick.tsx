import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface JoystickProps {
  onChange?: (value: { x: number; y: number }) => void;
}

interface Direction {
  key: string;
  label: string;
  vector: { x: number; y: number };
}

const directions: Direction[] = [
  { key: 'up-left', label: '↖', vector: { x: -1, y: 1 } },
  { key: 'up', label: '↑', vector: { x: 0, y: 1 } },
  { key: 'up-right', label: '↗', vector: { x: 1, y: 1 } },
  { key: 'left', label: '←', vector: { x: -1, y: 0 } },
  { key: 'center', label: '', vector: { x: 0, y: 0 } },
  { key: 'right', label: '→', vector: { x: 1, y: 0 } },
  { key: 'down-left', label: '↙', vector: { x: -1, y: -1 } },
  { key: 'down', label: '↓', vector: { x: 0, y: -1 } },
  { key: 'down-right', label: '↘', vector: { x: 1, y: -1 } },
];

export const Joystick: React.FC<JoystickProps> = ({ onChange }) => {
  const handlePressIn = useMemo(
    () =>
      (vector: { x: number; y: number }) => {
        onChange?.(vector);
      },
    [onChange],
  );

  const handlePressOut = useMemo(
    () => () => {
      onChange?.({ x: 0, y: 0 });
    },
    [onChange],
  );

  return (
    <View style={styles.controller}>
      <View style={styles.grid}>
        <View style={styles.middleOverlay} pointerEvents="box-none">
          <Pressable
            onPressIn={() => handlePressIn({ x: 0, y: 0 })}
            onPressOut={handlePressOut}
            style={({ pressed }) => [styles.funcOuter, pressed && styles.funcOuterActive]}
          >
            <View style={styles.funcInnerShadow}>
              <View style={styles.funcInner}>
                <Text style={styles.funcText}>FUNC</Text>
              </View>
            </View>
          </Pressable>
        </View>

        {directions.map((direction) => (
          <Pressable
            key={direction.key}
            onPressIn={() => handlePressIn(direction.vector)}
            onPressOut={handlePressOut}
            style={({ pressed }) => [styles.button, pressed && styles.buttonActive]}
          >
            {direction.label ? <Text style={styles.buttonLabel}>{direction.label}</Text> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  controller: {
    width: 210,
    alignSelf: 'center',
  },
  grid: {
    width: 210,
    height: 210,
    flexDirection: 'row',
    flexWrap: 'wrap',
    position: 'relative',
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#28292E',
  },
  middleOverlay: {
    position: 'absolute',
    top: 50,
    left: 50,
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E20',
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  funcOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E20',
  },
  funcOuterActive: {
    backgroundColor: '#4FF5C0',
  },
  funcInnerShadow: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2F3138',
  },
  funcInner: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E20',
    borderWidth: 1,
    borderColor: '#2A2B30',
  },
  funcText: {
    color: '#E5E7EB',
    fontWeight: '700',
  },
  button: {
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2D32',
    borderColor: '#3B3C42',
    borderWidth: 1,
  },
  buttonActive: {
    backgroundColor: '#4FF5C0',
    borderColor: '#4FF5C0',
  },
  buttonLabel: {
    color: '#E5E7EB',
    fontSize: 24,
  },
});
