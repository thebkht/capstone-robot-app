import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
     ActivityIndicator,
     Pressable,
     StyleSheet,
     View
} from 'react-native';

import { Joystick } from '@/components/joystick';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRobot } from '@/context/robot-provider';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CameraScreen() {
     const { api, baseUrl } = useRobot();
     const [joystick, setJoystick] = useState({ x: 0, y: 0 });
     const [error, setError] = useState<string | null>(null);
     const [isCapturing, setIsCapturing] = useState(false);
     const [lastSnapshot, setLastSnapshot] = useState<string | null>(null);
     const [currentFrame, setCurrentFrame] = useState<string | null>(null);
     const [isStreaming, setIsStreaming] = useState(false);
     const [isConnecting, setIsConnecting] = useState(false);
     const wsRef = useRef<WebSocket | null>(null);

     // WebSocket URL
     const wsUrl = useMemo(() => {
          if (!baseUrl) {
               return undefined;
          }
          // Convert http:// to ws:// or https:// to wss://
          const url = baseUrl.replace(/^http/, 'ws');
          return `${url}/camera/ws`;
     }, [baseUrl]);


     const connectWebSocket = useCallback(() => {
          if (!wsUrl) {
               setError('No WebSocket URL available');
               return;
          }

          setIsConnecting(true);
          setError(null);

          console.log('Connecting to WebSocket:', wsUrl);

          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
               console.log('WebSocket connected');
               setIsConnecting(false);
               setIsStreaming(true);
               setError(null);
          };

          ws.onmessage = (event) => {
               try {
                    const data = JSON.parse(event.data);

                    if (data.error) {
                         console.error('Stream error:', data.error);
                         setError(data.error);
                         return;
                    }

                    if (data.frame) {
                         // Update frame with base64 data
                         setCurrentFrame(`data:image/jpeg;base64,${data.frame}`);
                    }
               } catch (err) {
                    console.error('Error parsing WebSocket message:', err);
               }
          };

          ws.onerror = (event) => {
               console.error('WebSocket error:', event);
               setError('WebSocket connection error');
               setIsConnecting(false);
               setIsStreaming(false);
          };

          ws.onclose = (event) => {
               console.log('WebSocket closed:', event.code, event.reason);
               setIsStreaming(false);
               setIsConnecting(false);

               if (!event.wasClean) {
                    setError(`Connection closed unexpectedly (${event.code})`);
               }
          };
     }, [wsUrl]);

     const disconnectWebSocket = useCallback(() => {
          if (wsRef.current) {
               wsRef.current.close();
               wsRef.current = null;
          }
          setIsStreaming(false);
          setIsConnecting(false);
          setCurrentFrame(null);
     }, []);

     // Auto-start streaming when wsUrl becomes available
     useEffect(() => {
          if (wsUrl && !isStreaming && !isConnecting) {
               console.log('Auto-starting stream...');
               connectWebSocket();
          }
     }, [wsUrl, isStreaming, isConnecting, connectWebSocket]);

     // Cleanup on unmount
     useEffect(() => {
          return () => {
               disconnectWebSocket();
          };
     }, [disconnectWebSocket]);

     const handleToggleStream = useCallback(() => {
          if (isStreaming || isConnecting) {
               disconnectWebSocket();
          } else {
               connectWebSocket();
          }
     }, [isStreaming, isConnecting, connectWebSocket, disconnectWebSocket]);

     const resolveSnapshotUrl = useCallback(() => {
          if (!baseUrl) {
               return null;
          }
          const cacheBuster = Date.now();
          return `${api.snapshotUrl}?ts=${cacheBuster}`;
     }, [api, baseUrl]);

     const handleSnapshot = useCallback(async () => {
          setIsCapturing(true);
          try {
               const metadata = await api.capturePhoto();
               const url =
                    (metadata?.url as string | undefined) ||
                    (metadata?.snapshotUrl as string | undefined) ||
                    (metadata?.imageUrl as string | undefined) ||
                    (metadata?.path as string | undefined) ||
                    resolveSnapshotUrl();
               setLastSnapshot(url ?? null);
          } catch (error) {
               console.warn('Snapshot failed', error);
               setLastSnapshot(resolveSnapshotUrl());
          } finally {
               setIsCapturing(false);
          }
     }, [api, resolveSnapshotUrl]);

     return (
          <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
               <ThemedView style={styles.container}>
                    <ThemedText type="title">Camera</ThemedText>

                    {/* {wsUrl && (
                         <View style={styles.statusBar}>
                              <ThemedText style={styles.statusText}>
                                   {isConnecting ? 'Connecting...' :
                                        isStreaming ? `Streaming | ${frameCount} frames | ${fps.toFixed(1)} fps` :
                                             'Disconnected'}
                              </ThemedText>
                              <Pressable
                                   style={[
                                        styles.streamButton,
                                        isStreaming && styles.streamButtonActive,
                                        isConnecting && styles.streamButtonConnecting
                                   ]}
                                   onPress={handleToggleStream}
                                   disabled={isConnecting}
                              >
                                   {isConnecting ? (
                                        <ActivityIndicator size="small" color="#04110B" />
                                   ) : (
                                        <ThemedText style={styles.streamButtonText}>
                                             {isStreaming ? '⏸ Stop' : '▶ Start'}
                                        </ThemedText>
                                   )}
                              </Pressable>
                         </View>
                    )} */}

                    <View style={styles.cameraFrame}>
                         {wsUrl ? (
                              <>
                                   {currentFrame ? (
                                        <Image
                                             source={{ uri: currentFrame }}
                                             style={styles.camera}
                                             contentFit="contain"
                                             cachePolicy="none"
                                             transition={null}
                                        />
                                   ) : (
                                        <View style={styles.placeholderContainer}>
                                             {isConnecting ? (
                                                  <>
                                                       <ActivityIndicator size="large" color="#1DD1A1" />
                                                       <ThemedText style={styles.placeholderText}>
                                                            Connecting to camera...
                                                       </ThemedText>
                                                  </>
                                             ) : (
                                                  <ThemedText style={styles.placeholderText}>
                                                       Press Start to begin streaming
                                                  </ThemedText>
                                             )}
                                        </View>
                                   )}

                                   {error && (
                                        <View style={styles.errorOverlay}>
                                             <ThemedText style={styles.errorText}>{error}</ThemedText>
                                             <ThemedText style={styles.errorSubtext}>
                                                  WebSocket: {wsUrl}
                                             </ThemedText>
                                             <Pressable
                                                  style={styles.retryButton}
                                                  onPress={handleToggleStream}
                                             >
                                                  <ThemedText style={styles.retryButtonText}>
                                                       Retry Connection
                                                  </ThemedText>
                                             </Pressable>
                                        </View>
                                   )}
                              </>
                         ) : (
                              <View style={styles.loadingContainer}>
                                   <ActivityIndicator size="large" color="#1DD1A1" />
                                   <ThemedText style={styles.loadingText}>
                                        No stream available. Configure the robot IP first.
                                   </ThemedText>
                              </View>
                         )}
                    </View>

                    <View style={styles.row}>
                         <Pressable
                              style={styles.secondaryButton}
                              onPress={handleToggleStream}
                         >
                              <ThemedText>
                                   {isStreaming ? 'Reconnect' : 'Connect'}
                              </ThemedText>
                         </Pressable>
                         <Pressable style={styles.primaryButton} onPress={handleSnapshot}>
                              {isCapturing ? (
                                   <ActivityIndicator color="#04110B" />
                              ) : (
                                   <ThemedText style={styles.primaryText}>Capture photo</ThemedText>
                              )}
                         </Pressable>
                    </View>

                    {lastSnapshot ? (
                         <ThemedView style={styles.snapshotCard}>
                              <ThemedText type="subtitle">Latest snapshot</ThemedText>
                              <Image
                                   source={{ uri: lastSnapshot }}
                                   style={styles.snapshot}
                                   contentFit="cover"
                              />
                         </ThemedView>
                    ) : null}

                    <ThemedView style={styles.joystickCard}>
                         <ThemedText type="title">Virtual joystick</ThemedText>
                         <Joystick onChange={setJoystick} />
                         <ThemedText style={styles.joystickValue}>
                              X: {joystick.x.toFixed(2)} Y: {joystick.y.toFixed(2)}
                         </ThemedText>
                    </ThemedView>
               </ThemedView>
          </SafeAreaView>
     );
}

const styles = StyleSheet.create({
     safeArea: {
          flex: 1,
          backgroundColor: "#161616",
     },
     container: {
          flex: 1,
          padding: 24,
          gap: 16,
          backgroundColor: '#161616',
     },
     statusBar: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 12,
          backgroundColor: '#1C1C1C',
          borderRadius: 4,
          borderWidth: 1,
          borderColor: '#202020',
     },
     statusText: {
          flex: 1,
          fontSize: 11,
          color: '#67686C',
          fontFamily: 'JetBrainsMono_400Regular',
     },
     streamButton: {
          paddingVertical: 6,
          paddingHorizontal: 12,
          backgroundColor: '#1DD1A1',
          borderRadius: 4,
          minWidth: 60,
          alignItems: 'center',
     },
     streamButtonActive: {
          backgroundColor: '#EF4444',
     },
     streamButtonConnecting: {
          backgroundColor: '#F59E0B',
     },
     streamButtonText: {
          color: '#04110B',
          fontSize: 12,
          fontWeight: '600',
     },
     cameraFrame: {
          borderRadius: 0,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#202020',
          aspectRatio: 4 / 3,
          backgroundColor: '#1B1B1B',
          alignItems: 'center',
          justifyContent: 'center',
     },
     camera: {
          width: '100%',
          height: '100%',
     },
     placeholderContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
     },
     placeholderText: {
          color: '#6B7280',
          fontSize: 14,
          textAlign: 'center',
     },
     loadingContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
     },
     loadingText: {
          color: '#67686C',
          textAlign: 'center',
          paddingHorizontal: 24,
     },
     errorOverlay: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 12,
     },
     errorText: {
          color: '#EF4444',
          fontSize: 16,
          textAlign: 'center',
     },
     errorSubtext: {
          color: '#67686C',
          fontSize: 10,
          textAlign: 'center',
          fontFamily: 'JetBrainsMono_400Regular',
     },
     retryButton: {
          marginTop: 8,
          paddingVertical: 8,
          paddingHorizontal: 16,
          backgroundColor: '#1DD1A1',
          borderRadius: 4,
     },
     retryButtonText: {
          color: '#04110B',
          fontSize: 14,
          fontWeight: '600',
     },
     row: {
          flexDirection: 'row',
          gap: 16,
          alignItems: 'center',
     },
     primaryButton: {
          flex: 1,
          backgroundColor: '#1DD1A1',
          borderRadius: 0,
          paddingVertical: 16,
          alignItems: 'center',
     },
     primaryText: {
          color: '#04110B',
     },
     secondaryButton: {
          flex: 1,
          borderRadius: 0,
          paddingVertical: 16,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#202020',
          backgroundColor: '#1B1B1B',
     },
     snapshotCard: {
          gap: 16,
          padding: 20,
          borderRadius: 0,
          borderWidth: 1,
          borderColor: '#202020',
          backgroundColor: '#1C1C1C',
     },
     snapshot: {
          width: '100%',
          aspectRatio: 4 / 3,
          borderRadius: 0,
     },
     joystickCard: {
          gap: 16,
          padding: 20,
          borderRadius: 0,
          borderWidth: 1,
          borderColor: '#202020',
          backgroundColor: '#1C1C1C',
          alignItems: 'center',
     },
     joystickValue: {
          fontVariant: ['tabular-nums'],
          color: '#E5E7EB',
     },
});