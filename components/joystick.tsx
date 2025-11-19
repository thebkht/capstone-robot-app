import React, { useCallback } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useRobot } from '@/context/robot-provider';
import {
  cmdJsonCmd,
  cmd_movition_ctrl,
  max_speed,
  slow_speed,
  MovementCommand,
} from '@/services/json-socket';

interface JoystickProps {
  onChange?: (value: { l: number; r: number }) => void;
}

interface Direction {
  key: string;
  label: string;
  vector: { l: number; r: number };
  rotation?: string;
  hasIcon?: boolean;
  command?: MovementCommand;
}

const stopCommand: MovementCommand = { T: cmd_movition_ctrl, L: 0, R: 0 };

const directions: Direction[] = [
  {
    key: 'up-left',
    label: '',
    vector: { l: -1, r: 1 },
    rotation: '-45deg',
    hasIcon: true,
    command: { T: cmd_movition_ctrl, L: slow_speed, R: max_speed },
  },
  {
    key: 'up',
    label: '',
    vector: { l: 0, r: 1 },
    rotation: '0deg',
    hasIcon: true,
    command: { T: cmd_movition_ctrl, L: max_speed, R: max_speed },
  },
  {
    key: 'up-right',
    label: '',
    vector: { l: 1, r: 1 },
    rotation: '45deg',
    hasIcon: true,
    command: { T: cmd_movition_ctrl, L: max_speed, R: slow_speed },
  },
  {
    key: 'left',
    label: '',
    vector: { l: -1, r: 0 },
    rotation: '-90deg',
    hasIcon: true,
    command: { T: cmd_movition_ctrl, L: -max_speed, R: max_speed },
  },
  {
    key: 'center',
    label: '',
    vector: { l: 0, r: 0 },
    hasIcon: false,
    command: stopCommand,
  },
  {
    key: 'right',
    label: '',
    vector: { l: 1, r: 0 },
    rotation: '90deg',
    hasIcon: true,
    command: { T: cmd_movition_ctrl, L: max_speed, R: -max_speed },
  },
  {
    key: 'down-left',
    label: '',
    vector: { l: -1, r: -1 },
    rotation: '-135deg',
    hasIcon: true,
    command: { T: cmd_movition_ctrl, L: -slow_speed, R: -max_speed },
  },
  {
    key: 'down',
    label: '',
    vector: { l: 0, r: -1 },
    rotation: '180deg',
    hasIcon: true,
    command: { T: cmd_movition_ctrl, L: -max_speed, R: -max_speed },
  },
  {
    key: 'down-right',
    label: '',
    vector: { l: 1, r: -1 },
    rotation: '135deg',
    hasIcon: true,
    command: { T: cmd_movition_ctrl, L: -max_speed, R: -slow_speed },
  },
];

const arrowSource = require('../assets/images/ctrl_arrow.svg');

export const Joystick: React.FC<JoystickProps> = ({ onChange }) => {
  const { baseUrl } = useRobot();

  const handlePressIn = useCallback(
    (direction: Direction) => {
      onChange?.(direction.vector);

      if (direction.command) {
        cmdJsonCmd({ ...direction.command }, baseUrl);
      }
    },
    [baseUrl, onChange],
  );

  const handlePressOut = useCallback(() => {
    onChange?.({ l: 0, r: 0 });
    cmdJsonCmd({ ...stopCommand }, baseUrl);
  }, [baseUrl, onChange]);

  return (
    <View style={styles.controller}>
      <View style={styles.grid}>
        <View style={styles.middleOverlay} pointerEvents="box-none">
          <Pressable
            onPressIn={() =>
              handlePressIn({
                key: 'center',
                label: '',
                vector: { l: 0, r: 0 },
                hasIcon: false,
                command: stopCommand,
              })
            }
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
            onPressIn={() => handlePressIn(direction)}
            onPressOut={handlePressOut}
            style={({ pressed }) => [styles.button, pressed && styles.buttonActive]}
          >
            {({ pressed }) => (
              <View style={styles.buttonContent}>
                {direction.hasIcon ? (
                  <Image
                    source={arrowSource}
                    style={[
                      styles.arrow,
                      direction.rotation ? { transform: [{ rotate: direction.rotation }] } : null,
                    ]}
                    tintColor={pressed ? '#FFFFFF' : '#C6C7CC'}
                    contentFit="contain"
                    accessible={false}
                  />
                ) : null}
                {direction.label ? <Text style={styles.buttonLabel}>{direction.label}</Text> : null}
              </View>
            )}
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
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E20',
  },
  funcOuterActive: {
    backgroundColor: '#4FF5C0',
  },
  funcInnerShadow: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2F3138',
  },
  funcInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
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
  buttonContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  buttonActive: {
    backgroundColor: '#4FF5C0',
    borderColor: '#4FF5C0',
  },
  arrow: {
    width: 32,
    height: 32,
  },
  buttonLabel: {
    color: '#E5E7EB',
    fontSize: 24,
  },
});
