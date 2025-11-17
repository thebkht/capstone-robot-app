import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
     ActivityIndicator,
     Pressable,
     ScrollView,
     StyleSheet,
     TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { SerifFonts } from "@/constants/theme";
import { useRobot } from "@/context/robot-provider";

const TITLE_FONT_FAMILY = SerifFonts.bold;
const SUBTITLE_FONT_FAMILY = SerifFonts.semiBold;
const MONO_REGULAR_FONT_FAMILY = "JetBrainsMono_400Regular";
const MONO_SEMIBOLD_FONT_FAMILY = "JetBrainsMono_600SemiBold";

export const CONTROL_TOKEN_STORAGE_KEY = "robot_control_token";

export default function PairingScreen() {
     const router = useRouter();
     const { api, setControlToken, setSessionId, status } = useRobot();
     const [isRequestingPairing, setIsRequestingPairing] = useState(false);
     const [showPinInput, setShowPinInput] = useState(false);
     const [pin, setPin] = useState("");
     const [isConfirmingPairing, setIsConfirmingPairing] = useState(false);
     const [error, setError] = useState<string | null>(null);
     const [success, setSuccess] = useState<string | null>(null);
     const [hasAutoStarted, setHasAutoStarted] = useState(false);

     const handlePairRobot = useCallback(async () => {
          setIsRequestingPairing(true);
          setError(null);
          setSuccess(null);

          try {
               const response = await api.requestClaim();
               console.log("Pairing request successful", response);
               setShowPinInput(true);
               setSuccess("Enter the 6-digit PIN shown on the robot.");
          } catch (error) {
               console.error("Failed to request pairing", error);
               setError(
                    error instanceof Error
                         ? error.message
                         : "Failed to request pairing. Make sure you're connected to the robot."
               );
          } finally {
               setIsRequestingPairing(false);
          }
     }, [api]);

     // Auto-start pairing if navigated here after connection
     useEffect(() => {
          if (status?.network?.ip && !hasAutoStarted && !showPinInput && !isRequestingPairing) {
               setHasAutoStarted(true);
               // Small delay to let the screen render
               setTimeout(() => {
                    void handlePairRobot();
               }, 500);
          }
     }, [status?.network?.ip, hasAutoStarted, showPinInput, isRequestingPairing, handlePairRobot]);

     const handleSubmitPin = async () => {
          if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
               setError("Please enter a valid 6-digit PIN.");
               return;
          }

          setIsConfirmingPairing(true);
          setError(null);
          setSuccess(null);

          try {
               const response = await api.confirmClaim(pin);
               console.log("Pairing confirmation successful", response);

               if (response.controlToken) {
                    await setControlToken(response.controlToken);
                    const sessionId =
                         response.sessionId || response.session_id || response.session;

                    if (sessionId) {
                         await setSessionId(sessionId);
                    }
                    setSuccess("Robot paired successfully! Redirecting...");
                    setTimeout(() => {
                         router.replace("/");
                    }, 1500);
               } else {
                    setError("Pairing succeeded but no control token was received.");
               }
          } catch (error) {
               console.error("Failed to confirm pairing", error);
               setError(
                    error instanceof Error
                         ? error.message
                         : "Failed to confirm pairing. Please check the PIN and try again."
               );
          } finally {
               setIsConfirmingPairing(false);
          }
     };

     return (
          <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
               <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
               >
                    <ThemedView style={styles.container}>
                         <ThemedText type="title" style={styles.heading}>
                              Pair Robot
                         </ThemedText>
                         <ThemedText style={styles.subheading}>
                              Pair this device with your robot to establish a secure connection.
                              Make sure you&apos;re connected to the robot&apos;s network.
                         </ThemedText>

                         {error ? (
                              <ThemedView style={styles.messageCard}>
                                   <ThemedText style={styles.errorText}>{error}</ThemedText>
                              </ThemedView>
                         ) : null}

                         {success ? (
                              <ThemedView style={styles.messageCard}>
                                   <ThemedText style={styles.successText}>{success}</ThemedText>
                              </ThemedView>
                         ) : null}

                         {!showPinInput ? (
                              <Pressable
                                   style={[
                                        styles.primaryButton,
                                        isRequestingPairing && styles.disabledPrimary,
                                   ]}
                                   onPress={handlePairRobot}
                                   disabled={isRequestingPairing}
                              >
                                   {isRequestingPairing ? (
                                        <ActivityIndicator color="#04110B" />
                                   ) : (
                                        <ThemedText style={styles.primaryButtonText}>
                                             Pair Robot
                                        </ThemedText>
                                   )}
                              </Pressable>
                         ) : (
                              <ThemedView style={styles.pinCard}>
                                   <ThemedText type="subtitle" style={styles.pinTitle}>
                                        Enter 6-digit PIN
                                   </ThemedText>
                                   <ThemedText style={styles.pinHint}>
                                        Enter the PIN displayed on the robot screen.
                                   </ThemedText>
                                   <TextInput
                                        style={styles.pinInput}
                                        value={pin}
                                        onChangeText={(text) => {
                                             const digitsOnly = text.replace(/\D/g, "").slice(0, 6);
                                             setPin(digitsOnly);
                                             setError(null);
                                        }}
                                        placeholder="000000"
                                        placeholderTextColor="#6B7280"
                                        keyboardType="number-pad"
                                        maxLength={6}
                                        autoFocus
                                        editable={!isConfirmingPairing}
                                   />
                                   <Pressable
                                        style={[
                                             styles.primaryButton,
                                             (pin.length !== 6 || isConfirmingPairing) &&
                                             styles.disabledPrimary,
                                        ]}
                                        onPress={handleSubmitPin}
                                        disabled={pin.length !== 6 || isConfirmingPairing}
                                   >
                                        {isConfirmingPairing ? (
                                             <ActivityIndicator color="#04110B" />
                                        ) : (
                                             <ThemedText style={styles.primaryButtonText}>
                                                  Submit PIN
                                             </ThemedText>
                                        )}
                                   </Pressable>
                                   <Pressable
                                        style={styles.secondaryButton}
                                        onPress={() => {
                                             setShowPinInput(false);
                                             setPin("");
                                             setError(null);
                                             setSuccess(null);
                                        }}
                                        disabled={isConfirmingPairing}
                                   >
                                        <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
                                   </Pressable>
                              </ThemedView>
                         )}
                    </ThemedView>
               </ScrollView>
          </SafeAreaView>
     );
}

const styles = StyleSheet.create({
     safeArea: {
          flex: 1,
          backgroundColor: "#161616",
     },
     scrollView: {
          flex: 1,
     },
     scrollContent: {
          paddingBottom: 48,
     },
     container: {
          flex: 1,
          padding: 24,
          gap: 24,
          backgroundColor: "#161616",
     },
     heading: {
          fontFamily: TITLE_FONT_FAMILY,
     },
     subheading: {
          color: "#D1D5DB",
          fontFamily: MONO_REGULAR_FONT_FAMILY,
     },
     messageCard: {
          gap: 16,
          padding: 20,
          borderRadius: 0,
          borderWidth: 1,
          borderColor: "#202020",
          backgroundColor: "#1C1C1C",
     },
     errorText: {
          color: "#F87171",
          fontFamily: MONO_REGULAR_FONT_FAMILY,
     },
     successText: {
          color: "#1DD1A1",
          fontFamily: MONO_REGULAR_FONT_FAMILY,
     },
     pinCard: {
          gap: 16,
          padding: 20,
          borderRadius: 0,
          borderWidth: 1,
          borderColor: "#202020",
          backgroundColor: "#1C1C1C",
     },
     pinTitle: {
          color: "#F9FAFB",
          fontFamily: SUBTITLE_FONT_FAMILY,
     },
     pinHint: {
          color: "#67686C",
          fontFamily: MONO_REGULAR_FONT_FAMILY,
     },
     pinInput: {
          backgroundColor: "#161616",
          borderWidth: 1,
          borderColor: "#202020",
          borderRadius: 0,
          padding: 16,
          color: "#F9FAFB",
          fontFamily: MONO_SEMIBOLD_FONT_FAMILY,
          fontSize: 24,
          letterSpacing: 8,
          textAlign: "center",
     },
     primaryButton: {
          backgroundColor: "#1DD1A1",
          borderRadius: 0,
          paddingVertical: 16,
          alignItems: "center",
     },
     disabledPrimary: {
          opacity: 0.5,
     },
     primaryButtonText: {
          color: "#04110B",
          fontFamily: MONO_SEMIBOLD_FONT_FAMILY,
     },
     secondaryButton: {
          borderWidth: 1,
          borderColor: "#202020",
          paddingVertical: 16,
          alignItems: "center",
          borderRadius: 0,
          backgroundColor: "#1B1B1B",
     },
     secondaryButtonText: {
          color: "#E5E7EB",
          fontFamily: MONO_REGULAR_FONT_FAMILY,
     },
});

