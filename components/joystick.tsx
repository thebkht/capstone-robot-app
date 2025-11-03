import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, GestureResponderEvent, PanResponder, PanResponderGestureState, StyleSheet, View } from 'react-native';

interface JoystickProps {
  size?: number;
  onChange?: (value: { x: number; y: number }) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const Joystick: React.FC<JoystickProps> = ({ size = 180, onChange }) => {
  const radius = size / 2;
  const knobRadius = size * 0.18;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [dragging, setDragging] = useState(false);

  const emitChange = useCallback(
    (gestureState: PanResponderGestureState) => {
      const x = clamp(gestureState.dx, -radius + knobRadius, radius - knobRadius);
      const y = clamp(gestureState.dy, -radius + knobRadius, radius - knobRadius);
      onChange?.({
        x: Number((x / (radius - knobRadius)).toFixed(2)),
        y: Number((-y / (radius - knobRadius)).toFixed(2)),
      });
    },
    [knobRadius, onChange, radius],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          pan.setValue({ x: 0, y: 0 });
          setDragging(true);
        },
        onPanResponderMove: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          const x = clamp(gestureState.dx, -radius + knobRadius, radius - knobRadius);
          const y = clamp(gestureState.dy, -radius + knobRadius, radius - knobRadius);
          pan.setValue({ x, y });
          emitChange(gestureState);
        },
        onPanResponderRelease: () => {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
          setDragging(false);
          onChange?.({ x: 0, y: 0 });
        },
      }),
    [emitChange, knobRadius, onChange, pan, radius],
  );

  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: radius }]}>
      <View style={[styles.crosshair, styles.horizontal]} />
      <View style={[styles.crosshair, styles.vertical]} />
      <Animated.View
        style={[
          styles.knob,
          {
            width: knobRadius * 2,
            height: knobRadius * 2,
            borderRadius: knobRadius,
            transform: pan.getTranslateTransform(),
            opacity: dragging ? 0.95 : 0.8,
          },
        ]}
        {...panResponder.panHandlers}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  knob: {
    backgroundColor: 'rgba(66, 135, 245, 0.6)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  crosshair: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  horizontal: {
    width: '100%',
    height: 1,
  },
  vertical: {
    width: 1,
    height: '100%',
  },
});
