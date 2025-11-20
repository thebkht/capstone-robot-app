import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Audio, Recording } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { CameraVideo } from '@/components/camera-video';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRobot } from '@/context/robot-provider';

interface VoiceLogEntry {
  id: string;
  label: string;
  message: string;
  tone: 'info' | 'partial' | 'final' | 'client' | 'error';
  timestamp: Date;
}

const MAX_LOG_ITEMS = 50;
const AUDIO_SAMPLE_RATE = 16000;

const buildWebSocketUrl = (baseUrl: string | undefined, path: string) => {
  if (!baseUrl) return undefined;

  try {
    const normalizedUrl = baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`;
    const parsedUrl = new URL(normalizedUrl);
    const host = parsedUrl.hostname;
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === 'localhost';

    parsedUrl.protocol = isIp
      ? 'ws:'
      : parsedUrl.protocol === 'https:'
        ? 'wss:'
        : 'ws:';

    parsedUrl.pathname = `${parsedUrl.pathname.replace(/\/$/, '')}${path}`;
    parsedUrl.search = '';

    return parsedUrl.toString();
  } catch (error) {
    console.warn('Invalid base URL for WebSocket', error);
    return undefined;
  }
};

export default function AgenticVoiceScreen() {
  const router = useRouter();
  const { api, baseUrl } = useRobot();

  const cameraWsUrl = useMemo(() => buildWebSocketUrl(baseUrl, '/camera/ws'), [baseUrl]);
  const audioWsUrl = useMemo(() => buildWebSocketUrl(baseUrl, '/audio-stream'), [baseUrl]);

  const cameraSocket = useRef<WebSocket | null>(null);
  const audioSocket = useRef<WebSocket | null>(null);
  const recordingRef = useRef<Recording | null>(null);

  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isCameraStreaming, setIsCameraStreaming] = useState(false);
  const [isCameraConnecting, setIsCameraConnecting] = useState(false);
  const [isAudioConnected, setIsAudioConnected] = useState(false);
  const [isAudioConnecting, setIsAudioConnecting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [isAdjustingLights, setIsAdjustingLights] = useState(false);
  const [voiceLog, setVoiceLog] = useState<VoiceLogEntry[]>([]);

  const appendLog = useCallback((entry: Omit<VoiceLogEntry, 'id' | 'timestamp'>) => {
    setVoiceLog((prev) => {
      const next = [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          timestamp: new Date(),
          ...entry,
        },
        ...prev,
      ];

      return next.slice(0, MAX_LOG_ITEMS);
    });
  }, []);

  const connectCamera = useCallback(() => {
    if (!cameraWsUrl) {
      setCameraError('No camera WebSocket URL available');
      return;
    }

    setIsCameraConnecting(true);
    setCameraError(null);

    const ws = new WebSocket(cameraWsUrl);
    cameraSocket.current = ws;

    ws.onopen = () => {
      setIsCameraConnecting(false);
      setIsCameraStreaming(true);
      setCameraError(null);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.error) {
          setCameraError(data.error);
          return;
        }

        if (data.frame) {
          setCurrentFrame(`data:image/jpeg;base64,${data.frame}`);
        }
      } catch (error) {
        console.warn('Camera stream parse error', error);
      }
    };

    ws.onerror = () => {
      setCameraError('Camera stream error');
      setIsCameraConnecting(false);
      setIsCameraStreaming(false);
    };

    ws.onclose = () => {
      setIsCameraStreaming(false);
      setIsCameraConnecting(false);
    };
  }, [cameraWsUrl]);

  const disconnectCamera = useCallback(() => {
    if (cameraSocket.current) {
      cameraSocket.current.close();
      cameraSocket.current = null;
    }
    setIsCameraStreaming(false);
    setIsCameraConnecting(false);
    setCurrentFrame(null);
  }, []);

  const handleToggleCamera = useCallback(() => {
    if (isCameraStreaming || isCameraConnecting) {
      disconnectCamera();
    } else {
      connectCamera();
    }
  }, [connectCamera, disconnectCamera, isCameraConnecting, isCameraStreaming]);

  useEffect(() => {
    if (cameraWsUrl && !isCameraStreaming && !isCameraConnecting) {
      connectCamera();
    }
  }, [cameraWsUrl, connectCamera, isCameraStreaming, isCameraConnecting]);

  useEffect(() => () => disconnectCamera(), [disconnectCamera]);

  const connectAudioSocket = useCallback(() => {
    if (!audioWsUrl) {
      setAudioError('No audio WebSocket URL available');
      return;
    }

    setIsAudioConnecting(true);
    setAudioError(null);

    const ws = new WebSocket(audioWsUrl);
    audioSocket.current = ws;

    ws.onopen = () => {
      setIsAudioConnecting(false);
      setIsAudioConnected(true);
      appendLog({ label: 'Voice link ready', message: 'Connected to robot audio-stream WebSocket.', tone: 'info' });
    };

    ws.onmessage = (event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        if (data.partialTranscript) {
          appendLog({ label: 'Partial transcript', message: data.partialTranscript, tone: 'partial' });
          return;
        }

        if (data.finalTranscript) {
          appendLog({ label: 'Final transcript', message: data.finalTranscript, tone: 'final' });
          return;
        }

        if (data.assistant) {
          appendLog({ label: 'Assistant', message: data.assistant, tone: 'info' });
          return;
        }

        if (data.message) {
          appendLog({ label: 'Robot', message: data.message, tone: 'info' });
        }
      } catch (error) {
        appendLog({ label: 'Robot', message: String(event.data ?? 'Message received'), tone: 'info' });
      }
    };

    ws.onerror = () => {
      setAudioError('Audio stream error');
      setIsAudioConnecting(false);
      setIsAudioConnected(false);
    };

    ws.onclose = () => {
      setIsAudioConnected(false);
      setIsAudioConnecting(false);
      appendLog({ label: 'Voice link closed', message: 'Robot closed the audio WebSocket.', tone: 'error' });
    };
  }, [appendLog, audioWsUrl]);

  const disconnectAudioSocket = useCallback(() => {
    if (audioSocket.current) {
      audioSocket.current.close();
      audioSocket.current = null;
    }
    setIsAudioConnected(false);
    setIsAudioConnecting(false);
  }, []);

  useEffect(() => {
    if (audioWsUrl && !isAudioConnected && !isAudioConnecting) {
      connectAudioSocket();
    }
  }, [audioWsUrl, connectAudioSocket, isAudioConnected, isAudioConnecting]);

  useEffect(() => () => disconnectAudioSocket(), [disconnectAudioSocket]);

  const sendAudioChunks = useCallback(async (base64Payload: string) => {
    if (!audioSocket.current || audioSocket.current.readyState !== WebSocket.OPEN) {
      setRecordingError('Audio socket not connected');
      return;
    }

    const chunkSize = 8000;
    for (let i = 0; i < base64Payload.length; i += chunkSize) {
      const chunk = base64Payload.slice(i, i + chunkSize);
      audioSocket.current.send(
        JSON.stringify({ type: 'audio_chunk', encoding: 'base64', data: chunk })
      );
    }

    audioSocket.current.send(
      JSON.stringify({ type: 'audio_end', encoding: 'base64', sampleRate: AUDIO_SAMPLE_RATE })
    );
    appendLog({ label: 'You', message: 'Voice clip streamed to robot.', tone: 'client' });
  }, [appendLog]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) {
      return;
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      setIsRecording(false);

      if (uri) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await sendAudioChunks(base64);
      }
    } catch (error) {
      console.warn('Failed to stop recording', error);
      setRecordingError('Failed to stop recording');
    } finally {
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    }
  }, [sendAudioChunks]);

  const startRecording = useCallback(async () => {
    if (isRecording || isAudioConnecting) {
      return;
    }

    setRecordingError(null);

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setRecordingError('Microphone permission is required to talk to the robot.');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: '.wav',
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_LINEAR_PCM,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_PCM_16BIT,
          sampleRate: AUDIO_SAMPLE_RATE,
          numberOfChannels: 1,
          bitRate: 256000,
        },
        ios: {
          extension: '.wav',
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: AUDIO_SAMPLE_RATE,
          numberOfChannels: 1,
          bitRate: 256000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: { mimeType: 'audio/wav' },
      });

      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);

      if (audioSocket.current?.readyState === WebSocket.OPEN) {
        audioSocket.current.send(
          JSON.stringify({ type: 'start', encoding: 'pcm16', sampleRate: AUDIO_SAMPLE_RATE })
        );
      }
      appendLog({ label: 'You', message: 'Listening... release to send.', tone: 'client' });
    } catch (error) {
      console.warn('Failed to start recording', error);
      setRecordingError('Unable to access microphone');
    }
  }, [appendLog, isAudioConnecting, isRecording]);

  const handleSetLights = useCallback(
    async (pwmA: number, pwmB: number) => {
      setIsAdjustingLights(true);
      try {
        await api.controlLights({ pwmA, pwmB });
      } catch (error) {
        console.warn('Failed to set lights', error);
      } finally {
        setIsAdjustingLights(false);
      }
    },
    [api]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ThemedView style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={16} color="#E5E7EB" />
          </Pressable>
          <ThemedText type="title">Agentic control</ThemedText>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, isCameraStreaming ? styles.statusOn : styles.statusOff]} />
            <ThemedText style={styles.statusText}>
              Camera {isCameraStreaming ? 'streaming' : isCameraConnecting ? 'connecting' : 'idle'}
            </ThemedText>
          </View>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, isAudioConnected ? styles.statusOn : styles.statusOff]} />
            <ThemedText style={styles.statusText}>
              Voice {isAudioConnected ? 'linked' : isAudioConnecting ? 'connecting' : 'disconnected'}
            </ThemedText>
          </View>
        </View>

        <CameraVideo
          wsUrl={cameraWsUrl}
          currentFrame={currentFrame}
          isConnecting={isCameraConnecting}
          isStreaming={isCameraStreaming}
          error={cameraError}
          onToggleStream={handleToggleCamera}
          onSetLights={handleSetLights}
          isAdjustingLights={isAdjustingLights}
        />

        <ThemedView style={styles.card}>
          <View style={styles.cardHeader}>
            <ThemedText type="subtitle">Push-to-talk</ThemedText>
            <Pressable onPress={isAudioConnected ? disconnectAudioSocket : connectAudioSocket}>
              <ThemedText type="link">{isAudioConnected ? 'Reconnect' : 'Retry link'}</ThemedText>
            </Pressable>
          </View>
          <ThemedText style={styles.cardDescription}>
            Hold to stream microphone audio to the robot over WebSocket. Release to upload the
            clip and receive transcripts and assistant messages.
          </ThemedText>
          <Pressable
            style={[
              styles.talkButton,
              isRecording && styles.talkButtonActive,
              !isAudioConnected && !isAudioConnecting && styles.talkButtonDisabled,
            ]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            disabled={!isAudioConnected && !isAudioConnecting}
          >
            {isRecording ? (
              <ActivityIndicator color="#04110B" />
            ) : (
              <IconSymbol name="mic.fill" size={18} color="#04110B" />
            )}
            <ThemedText style={styles.talkButtonText}>
              {isRecording ? 'Streaming...' : 'Hold to talk'}
            </ThemedText>
          </Pressable>
          {recordingError ? (
            <ThemedText style={styles.errorText}>{recordingError}</ThemedText>
          ) : null}
          {audioError ? (
            <ThemedText style={styles.errorText}>{audioError}</ThemedText>
          ) : null}
        </ThemedView>

        <ThemedView style={styles.logCard}>
          <View style={styles.cardHeader}>
            <ThemedText type="subtitle">Conversation log</ThemedText>
            <View style={styles.logLegend}>
              <View style={[styles.legendDot, styles.legendRobot]} />
              <ThemedText style={styles.legendText}>Robot</ThemedText>
              <View style={[styles.legendDot, styles.legendYou]} />
              <ThemedText style={styles.legendText}>You</ThemedText>
            </View>
          </View>
          <ScrollView style={styles.logScroll} showsVerticalScrollIndicator={false}>
            {voiceLog.length === 0 ? (
              <View style={styles.emptyLog}>
                <Image
                  source={require('@/assets/images/rovy.png')}
                  style={styles.emptyImage}
                  contentFit="contain"
                />
                <ThemedText style={styles.emptyText}>
                  Hold the microphone to start a conversation with your robot.
                </ThemedText>
              </View>
            ) : (
              voiceLog.map((entry) => (
                <View
                  key={entry.id}
                  style={[
                    styles.logItem,
                    entry.tone === 'client' ? styles.logItemClient : styles.logItemRobot,
                  ]}
                >
                  <View style={styles.logItemHeader}>
                    <ThemedText style={styles.logLabel}>{entry.label}</ThemedText>
                    <ThemedText style={styles.logTime}>
                      {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.logMessage}>{entry.message}</ThemedText>
                </View>
              ))
            )}
          </ScrollView>
        </ThemedView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#161616',
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
    backgroundColor: '#161616',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#202020',
    backgroundColor: '#1C1C1C',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 30,
    backgroundColor: '#0F1512',
    borderWidth: 1,
    borderColor: '#202020',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 10,
  },
  statusOn: {
    backgroundColor: '#1DD1A1',
  },
  statusOff: {
    backgroundColor: '#4B5563',
  },
  statusText: {
    color: '#E5E7EB',
    fontSize: 13,
  },
  card: {
    padding: 16,
    gap: 12,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#202020',
    backgroundColor: '#1C1C1C',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardDescription: {
    color: '#9CA3AF',
    lineHeight: 20,
  },
  talkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#1DD1A1',
  },
  talkButtonActive: {
    backgroundColor: '#0DAA80',
  },
  talkButtonDisabled: {
    opacity: 0.5,
  },
  talkButtonText: {
    color: '#04110B',
    fontWeight: '700',
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
  },
  logCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#202020',
    backgroundColor: '#0F1512',
    borderRadius: 0,
    padding: 16,
    gap: 12,
  },
  logScroll: {
    flex: 1,
  },
  emptyLog: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  emptyText: {
    color: '#9CA3AF',
    textAlign: 'center',
  },
  emptyImage: {
    width: 120,
    height: 80,
  },
  logItem: {
    padding: 12,
    borderRadius: 10,
    gap: 6,
    marginBottom: 10,
  },
  logItemRobot: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  logItemClient: {
    backgroundColor: '#11261E',
    borderWidth: 1,
    borderColor: '#1DD1A1',
  },
  logItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logLabel: {
    color: '#E5E7EB',
    fontWeight: '700',
  },
  logTime: {
    color: '#6B7280',
    fontSize: 12,
  },
  logMessage: {
    color: '#E5E7EB',
    lineHeight: 20,
  },
  logLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 10,
  },
  legendRobot: {
    backgroundColor: '#2563EB',
  },
  legendYou: {
    backgroundColor: '#1DD1A1',
  },
  legendText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
});
