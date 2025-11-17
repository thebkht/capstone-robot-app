import { Image } from 'expo-image';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

interface CameraVideoProps {
     wsUrl?: string;
     currentFrame: string | null;
     isConnecting: boolean;
     isStreaming: boolean;
     error: string | null;
     onToggleStream: () => void;
}

export function CameraVideo({
     wsUrl,
     currentFrame,
     isConnecting,
     isStreaming,
     error,
     onToggleStream,
}: CameraVideoProps) {
     return (
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
                                             {isStreaming
                                                  ? 'Waiting for video...'
                                                  : 'Press Start to begin streaming'}
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
                                   <Pressable style={styles.retryButton} onPress={onToggleStream}>
                                        <ThemedText style={styles.retryButtonText}>Retry Connection</ThemedText>
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
     );
}

const styles = StyleSheet.create({
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
});
