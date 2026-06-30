import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { File } from 'expo-file-system';
import MapView, { Marker, MapPressEvent, Region } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import StepIndicator from '../../components/ui/StepIndicator';
import Button from '../../components/ui/Button';
import { uploadIssueImage, UploadResult, UploadProgress } from '../../lib/upload';
import { submitIssue, getIssueById, IssueDetails, IssueCategory } from '../../lib/issues';
import { useAuthStore } from '../../lib/auth-store';
import { supabase } from '../../lib/supabase';


// Step definitions
const STEPS = ['Photo', 'Details', 'Location', 'Review'];

// Category options aligned with PRD
const CATEGORIES = [
  { label: 'Pothole', icon: 'warning' },
  { label: 'Water Leakage', icon: 'water' },
  { label: 'Streetlight', icon: 'bulb' },
  { label: 'Waste', icon: 'trash' },
  { label: 'Road Damage', icon: 'car' },
  { label: 'Flooding', icon: 'rainy' },
  { label: 'Other', icon: 'ellipsis-horizontal' },
] as const;

type Category = typeof CATEGORIES[number]['label'];

interface Coords {
  latitude: number;
  longitude: number;
}

export default function Report() {
  const mapRef = useRef<MapView>(null);
  const { session } = useAuthStore();

  // Step state
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1 — Photo
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Step 2 — Details
  const [category, setCategory] = useState<Category | null>(null);
  const [description, setDescription] = useState('');
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Step 3 — Location
  const [coords, setCoords] = useState<Coords | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: 12.9716,
    longitude: 77.5946,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  // Step 4 — Submit
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [submittedIssueId, setSubmittedIssueId] = useState<string | null>(null);
  const [issueDetails, setIssueDetails] = useState<IssueDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── Duplicate Detection State ─────────────────────────────────────────────
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<{
    id: string;
    category: string;
    severity: number;
    status: string;
    summary: string | null;
    distance_meters: number;
    similarity: number;
    confidence: number;
  } | null>(null);
  // When true the user has acknowledged the duplicate and wants to submit anyway
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);

  // ─── Live Update Subscription ──────────────────────────────────────────────
  React.useEffect(() => {
    if (!submittedIssueId) {
      setIssueDetails(null);
      return;
    }

    let isMounted = true;
    const fetchLatestDetails = async () => {
      setLoadingDetails(true);
      try {
        const details = await getIssueById(submittedIssueId);
        if (isMounted) {
          setIssueDetails(details);
        }
      } catch (err) {
        console.error('Error fetching issue initial details:', err);
      } finally {
        if (isMounted) {
          setLoadingDetails(false);
        }
      }
    };

    fetchLatestDetails();

    const channel = supabase
      .channel(`issue-live-updates-${submittedIssueId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'issues',
          filter: `id=eq.${submittedIssueId}`,
        },
        (payload) => {
          if (isMounted && payload.new) {
            setIssueDetails(payload.new as IssueDetails);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [submittedIssueId]);


  // ─── Duplicate check helpers ───────────────────────────────────────────────

  /**
   * Converts a local file URI to a base64 string using Expo File API.
   */
  function bytesToBase64(bytes: Uint8Array): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let output = '';

    for (let i = 0; i < bytes.length; i += 3) {
      const byte1 = bytes[i]!;
      const byte2 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
      const byte3 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
      const hasByte2 = i + 1 < bytes.length;
      const hasByte3 = i + 2 < bytes.length;

      const chunk = (byte1 << 16) | (byte2 << 8) | byte3;

      output += alphabet[(chunk >> 18) & 63];
      output += alphabet[(chunk >> 12) & 63];
      output += hasByte2 ? alphabet[(chunk >> 6) & 63] : '=';
      output += hasByte3 ? alphabet[chunk & 63] : '=';
    }

    return output;
  }

  async function uriToBase64(uri: string): Promise<string> {
    try {
      const file = new File(uri);
      const buffer = await file.arrayBuffer();
      return bytesToBase64(new Uint8Array(buffer));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to convert image to base64 for duplicate check: ${uri} (${message})`);
    }
  }

  /**
   * Calls the check-duplicate edge function.
   * Returns true if a duplicate was found (and sets duplicateCandidate state).
   */
  async function checkForDuplicates(): Promise<boolean> {
    if (!imageUri || !coords || !category) return false;
    setCheckingDuplicate(true);
    try {
      let imageBase64: string | undefined;
      try {
        imageBase64 = await uriToBase64(imageUri);
      } catch {
        imageBase64 = undefined;
      }

      const mimeType =
        imageUri.toLowerCase().endsWith('.png') ? 'image/png'
          : imageUri.toLowerCase().endsWith('.webp') ? 'image/webp'
            : 'image/jpeg';
      const { data, error } = await supabase.functions.invoke<{
        isDuplicate: boolean;
        confidence: number;
        candidates: Array<{
          id: string;
          category: string;
          severity: number;
          status: string;
          summary: string | null;
          distance_meters: number;
          similarity: number;
          combined_score: number;
        }>;
      }>('check-duplicate', {
        body: {
          category,
          latitude: coords.latitude,
          longitude: coords.longitude,
          imageBase64,
          mimeType,
        },
      });

      if (error || !data) {
        setDuplicateNotice('Duplicate service unavailable. Continuing submission...');
        return false;
      }

      if (data.isDuplicate && data.candidates.length > 0) {
        setDuplicateNotice(null);
        const top = data.candidates[0];
        setDuplicateCandidate({
          ...top,
          confidence: data.confidence,
        });
        setShowDuplicateModal(true);
        return true;
      }

      return false;
    } catch (err) {
      setDuplicateNotice('Duplicate service unavailable. Continuing submission...');
      return false;
    } finally {
      setCheckingDuplicate(false);
    }
  }

  // ─── Image Picker Logic ────────────────────────────────────────────────────

  const pickFromCamera = async () => {
    setImageError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setImageError('Camera permission is required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    setImageError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setImageError('Gallery access permission is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  // ─── GPS / Location Logic ─────────────────────────────────────────────────

  const detectGps = async () => {
    setGpsLoading(true);
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied. Please pin manually on the map.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const newCoords: Coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setCoords(newCoords);

      const newRegion: Region = {
        ...newCoords,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
      setMapRegion(newRegion);
      mapRef.current?.animateToRegion(newRegion, 600);
    } catch {
      setLocationError('Failed to get GPS location. Please pin manually.');
    } finally {
      setGpsLoading(false);
    }
  };

  const handleMapPress = (e: MapPressEvent) => {
    setCoords(e.nativeEvent.coordinate);
    setLocationError(null);
  };

  // ─── Navigation / Validation Logic ───────────────────────────────────────

  const goNext = () => {
    if (currentStep === 0) {
      if (!imageUri) {
        setImageError('Please add a photo before continuing.');
        return;
      }
      setImageError(null);
    }

    if (currentStep === 1) {
      if (!category) {
        setDetailsError('Please select an issue category.');
        return;
      }
      setDetailsError(null);
    }

    if (currentStep === 2) {
      if (!coords) {
        setLocationError('Please pin your location on the map or use GPS.');
        return;
      }
      setLocationError(null);
    }

    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const goBack = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  // ─── Image Upload & Issue Submit ──────────────────────────────────────────

  const handleSubmit = async () => {
    if (!imageUri || !coords || !category) return;

    const userId = session?.user?.id;
    if (!userId) {
      setUploadError('You must be signed in to submit a report.');
      return;
    }

    // ── Step 0: Duplicate check (skip if user already confirmed override) ──
    if (!overrideDuplicate) {
      const isDuplicate = await checkForDuplicates();
      if (isDuplicate) return;
    }

    setSubmitting(true);
    setUploadError(null);
    setUploadProgress({ percent: 0, loaded: 0, total: 0 });
    setDuplicateNotice(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Phase 1: Upload image to Supabase Storage
      const result = await uploadIssueImage(
        imageUri,
        (progress) => setUploadProgress(progress),
        controller.signal,
      );
      setUploadResult(result);

      // Phase 2: Insert issue row into Supabase (status = 'pending')
      const newIssue = await submitIssue({
        userId,
        imageKey: result.imageKey,
        imageUrl: result.imageUrl,
        category: category as IssueCategory,
        description: description || null,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });

      setSubmittedIssueId(newIssue.id);
      setSubmitted(true);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setUploadError('Upload was cancelled.');
      } else {
        setUploadError(err.message || 'Submission failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    abortControllerRef.current?.abort();
  };

  const resetForm = () => {
    setCurrentStep(0);
    setImageUri(null);
    setCategory(null);
    setDescription('');
    setCoords(null);
    setSubmitted(false);
    setImageError(null);
    setDetailsError(null);
    setLocationError(null);
    setUploadProgress(null);
    setUploadError(null);
    setUploadResult(null);
    setSubmittedIssueId(null);
    setIssueDetails(null);
    setLoadingDetails(false);
    setDuplicateNotice(null);
    setOverrideDuplicate(false);
    setDuplicateCandidate(null);
    setShowDuplicateModal(false);
  };

  // ─── Submitted Confirmation State ─────────────────────────────────────────

  if (submitted) {
    const classificationReady = !!issueDetails && issueDetails.status !== 'pending';

    return (
      <View className="flex-1 bg-slate-50 justify-center">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center mb-6">
            {loadingDetails ? (
              <View className="w-20 h-20 bg-sky-100 rounded-full items-center justify-center mb-4">
                <ActivityIndicator size="large" color="#0284c7" />
              </View>
            ) : classificationReady ? (
              <View className="w-20 h-20 bg-emerald-100 rounded-full items-center justify-center mb-4">
                <Ionicons name="checkmark-circle" size={48} color="#059669" />
              </View>
            ) : (
              <View className="w-20 h-20 bg-amber-100 rounded-full items-center justify-center mb-4">
                <Ionicons name="information-circle" size={48} color="#d97706" />
              </View>
            )}
            <Text className="text-2xl font-black text-slate-800 text-center">
              {loadingDetails
                ? 'Analyzing Civic Report...'
                : classificationReady
                  ? 'Report Processed!'
                  : 'AI analysis unavailable.'}
            </Text>
            <Text className="text-slate-500 text-center text-sm mt-2 px-4 leading-5">
              {loadingDetails
                ? 'Our Gemini AI is analyzing the photo and details to categorize and route your issue.'
                : classificationReady
                  ? 'Your report has been successfully processed and routed to the corresponding department.'
                  : 'Your report has been submitted successfully. Classification will complete automatically later.'}
            </Text>
          </View>

          {/* Details Card */}
          <View className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-6 p-5">
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">
                Report Status
              </Text>

            {/* Status Field */}
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-slate-500 text-sm font-semibold">Status</Text>
                <View className={`px-3 py-1 rounded-full ${classificationReady ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
                  }`}>
                <Text className={`font-extrabold text-xs capitalize ${classificationReady ? 'text-emerald-800' : 'text-amber-800'
                  }`}>
                  {issueDetails?.status || 'pending'}
                </Text>
              </View>
            </View>

            <View className="h-[1] bg-slate-100 mb-4" />

            {/* Category Field */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-slate-500 text-sm font-semibold">Category</Text>
              {classificationReady ? (
                <View className="bg-sky-50 border border-sky-100 px-3 py-1 rounded-full flex-row items-center">
                  <Text className="text-primary font-extrabold text-xs">
                    {issueDetails?.category}
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color="#64748b" className="mr-1.5" />
                  <Text className="text-slate-400 text-xs italic">AI Classifying...</Text>
                </View>
              )}
            </View>

            <View className="h-[1] bg-slate-100 mb-4" />

            {/* Severity Field */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-slate-500 text-sm font-semibold">Severity</Text>
              {classificationReady ? (
                <View className="flex-row items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Ionicons
                      key={i}
                      name="star"
                      size={14}
                      color={i < (issueDetails?.severity || 0) ? '#f59e0b' : '#cbd5e1'}
                    />
                  ))}
                  <Text className="text-slate-700 text-xs font-bold ml-1.5">
                    {issueDetails?.severity}/5
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color="#64748b" className="mr-1.5" />
                  <Text className="text-slate-400 text-xs italic">AI Determining...</Text>
                </View>
              )}
            </View>

            <View className="h-[1] bg-slate-100 mb-4" />

            {/* Summary Field */}
            <View className="mb-2">
              <Text className="text-slate-500 text-sm font-semibold mb-2">AI Summary</Text>
              {classificationReady ? (
                <View className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                  <Text className="text-slate-700 text-sm leading-5">
                    {issueDetails?.summary || 'No summary generated.'}
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-center py-1">
                  <ActivityIndicator size="small" color="#64748b" className="mr-1.5" />
                  <Text className="text-slate-400 text-xs italic">AI Generating...</Text>
                </View>
              )}
            </View>
          </View>

          <Button label="Report Another Issue" onPress={resetForm} fullWidth size="lg" disabled={loadingDetails} />
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-50"
    >
      {/* ── Duplicate Detection Modal ──────────────────────────────────── */}
      <Modal
        visible={showDuplicateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDuplicateModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-3xl p-6 shadow-xl">
            {/* Header */}
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 bg-amber-100 rounded-2xl items-center justify-center mr-3">
                <Ionicons name="warning" size={20} color="#d97706" />
              </View>
              <View className="flex-1">
                <Text className="text-slate-800 font-black text-base">Possible Duplicate</Text>
                <Text className="text-slate-400 text-xs">
                  {duplicateCandidate?.confidence ?? 0}% match confidence
                </Text>
              </View>
            </View>

            <Text className="text-slate-500 text-sm mb-4 leading-5">
              A similar issue has already been reported nearby. Upvoting the existing report has more impact than filing a new one.
            </Text>

            {/* Existing issue card */}
            {duplicateCandidate && (
              <View className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-5">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="bg-sky-50 border border-sky-100 px-2.5 py-0.5 rounded-full">
                    <Text className="text-primary font-extrabold text-xs">{duplicateCandidate.category}</Text>
                  </View>
                  <View className="bg-slate-100 px-2.5 py-0.5 rounded-full">
                    <Text className="text-slate-600 font-bold text-[10px] uppercase">
                      {duplicateCandidate.status.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                {duplicateCandidate.summary ? (
                  <Text className="text-slate-700 text-xs leading-4 mb-3" numberOfLines={3}>
                    {duplicateCandidate.summary}
                  </Text>
                ) : null}

                <View className="flex-row items-center gap-4">
                  <View className="flex-row items-center">
                    <Ionicons name="navigate" size={11} color="#0284c7" />
                    <Text className="text-primary text-[11px] font-bold ml-1">
                      {duplicateCandidate.distance_meters}m away
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Ionicons name="sparkles" size={11} color="#d97706" />
                    <Text className="text-amber-600 text-[11px] font-bold ml-1">
                      {duplicateCandidate.similarity}% image match
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    {[1, 2, 3, 4, 5].map(lvl => (
                      <Ionicons
                        key={lvl}
                        name="star"
                        size={10}
                        color={lvl <= duplicateCandidate.severity ? '#f59e0b' : '#cbd5e1'}
                      />
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Actions */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 bg-slate-100 border border-slate-200 rounded-2xl py-3 items-center"
                onPress={() => setShowDuplicateModal(false)}
              >
                <Text className="text-slate-700 font-bold text-sm">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-primary rounded-2xl py-3 items-center"
                onPress={() => {
                  setShowDuplicateModal(false);
                  setOverrideDuplicate(true);
                  // Small timeout so modal animation completes before upload starts
                  setTimeout(() => handleSubmit(), 150);
                }}
              >
                <Text className="text-white font-bold text-sm">Submit Anyway</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Step Indicator */}
      <View className="bg-white border-b border-slate-100 px-4">
        <StepIndicator steps={STEPS} currentStep={currentStep} />
      </View>

      {/* ── STEP 0: PHOTO ─────────────────────────────────────────────── */}
      {currentStep === 0 && (
        <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 24 }}>
          <Text className="text-xl font-black text-slate-800 mb-1">Add a Photo</Text>
          <Text className="text-slate-400 text-sm mb-6">
            Take a photo or pick one from your gallery. This is required for AI classification.
          </Text>

          {imageUri ? (
            <View className="relative rounded-3xl overflow-hidden mb-4 border border-slate-200">
              <Image
                source={{ uri: imageUri }}
                className="w-full h-64"
                resizeMode="cover"
              />
              <TouchableOpacity
                className="absolute top-3 right-3 w-9 h-9 bg-black/50 rounded-full items-center justify-center"
                onPress={() => setImageUri(null)}
              >
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
              <View className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent px-4 py-3">
                <Text className="text-white text-xs font-bold">✓ Photo Added</Text>
              </View>
            </View>
          ) : (
            <View className="border-2 border-dashed border-slate-300 rounded-3xl h-56 items-center justify-center mb-4 bg-white">
              <View className="w-16 h-16 bg-sky-50 rounded-full items-center justify-center mb-3">
                <Ionicons name="image" size={32} color="#0284c7" />
              </View>
              <Text className="text-slate-400 text-sm font-medium">No photo selected yet</Text>
            </View>
          )}

          {imageError && (
            <View className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 flex-row items-center">
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <Text className="text-red-500 text-xs font-bold ml-2">{imageError}</Text>
            </View>
          )}

          <View className="flex-row gap-3 mb-4">
            <TouchableOpacity
              className="flex-1 bg-primary rounded-xl py-3.5 items-center flex-row justify-center"
              onPress={pickFromCamera}
            >
              <Ionicons name="camera" size={18} color="#fff" />
              <Text className="text-white font-bold text-sm ml-2">Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-white border border-slate-200 rounded-xl py-3.5 items-center flex-row justify-center"
              onPress={pickFromGallery}
            >
              <Ionicons name="images" size={18} color="#475569" />
              <Text className="text-slate-700 font-bold text-sm ml-2">Gallery</Text>
            </TouchableOpacity>
          </View>

          <Button label="Continue →" onPress={goNext} fullWidth size="lg" />
        </ScrollView>
      )}

      {/* ── STEP 1: DETAILS ───────────────────────────────────────────── */}
      {currentStep === 1 && (
        <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 24 }}>
          <Text className="text-xl font-black text-slate-800 mb-1">Describe the Issue</Text>
          <Text className="text-slate-400 text-sm mb-6">
            Select a category and optionally add a description. Our AI will auto-fill missing details.
          </Text>

          {/* Category Grid */}
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Category *
          </Text>
          <View className="flex-row flex-wrap gap-2.5 mb-5">
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.label}
                onPress={() => { setCategory(cat.label); setDetailsError(null); }}
                className={`flex-row items-center px-3.5 py-2.5 rounded-2xl border ${category === cat.label
                  ? 'bg-primary border-primary'
                  : 'bg-white border-slate-200'
                  }`}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={14}
                  color={category === cat.label ? '#fff' : '#64748b'}
                />
                <Text
                  className={`text-xs font-bold ml-1.5 ${category === cat.label ? 'text-white' : 'text-slate-600'
                    }`}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {detailsError && (
            <View className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 flex-row items-center">
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <Text className="text-red-500 text-xs font-bold ml-2">{detailsError}</Text>
            </View>
          )}

          {/* Description Input */}
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Description (Optional)
          </Text>
          <TextInput
            className="bg-white border border-slate-200 rounded-2xl p-4 text-slate-700 text-sm min-h-[100] mb-6"
            placeholder="Describe the issue in your own words..."
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            maxLength={500}
          />
          <Text className="text-right text-xs text-slate-400 -mt-4 mb-6">
            {description.length}/500
          </Text>

          <View className="flex-row gap-3">
            <Button label="← Back" onPress={goBack} variant="secondary" size="lg" />
            <View className="flex-1">
              <Button label="Continue →" onPress={goNext} fullWidth size="lg" />
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── STEP 2: LOCATION ──────────────────────────────────────────── */}
      {currentStep === 2 && (
        <View className="flex-1">
          {/* Info strip */}
          <View className="px-5 pt-4 pb-3 bg-white border-b border-slate-100">
            <Text className="text-lg font-black text-slate-800 mb-0.5">Pin the Location</Text>
            <Text className="text-slate-400 text-xs">
              Use GPS or drag the marker on the map to mark the exact issue location.
            </Text>
          </View>

          {/* GPS button overlay */}
          <View className="absolute top-28 right-4 z-10">
            <TouchableOpacity
              className="w-12 h-12 bg-white rounded-2xl shadow-md border border-slate-100 items-center justify-center"
              onPress={detectGps}
              disabled={gpsLoading}
            >
              {gpsLoading ? (
                <ActivityIndicator size="small" color="#0284c7" />
              ) : (
                <Ionicons name="locate" size={22} color="#0284c7" />
              )}
            </TouchableOpacity>
          </View>

          {/* Map */}
          <MapView
            ref={mapRef}
            className="flex-1"
            region={mapRegion}
            onPress={handleMapPress}
            onRegionChangeComplete={setMapRegion}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {coords && (
              <Marker
                coordinate={coords}
                draggable
                onDragEnd={(e) => setCoords(e.nativeEvent.coordinate)}
                pinColor="#0284c7"
              />
            )}
          </MapView>

          {/* Bottom bar */}
          <View className="bg-white border-t border-slate-100 px-5 py-4">
            {locationError && (
              <View className="bg-red-50 border border-red-100 rounded-xl p-2.5 mb-3 flex-row items-center">
                <Ionicons name="alert-circle" size={14} color="#ef4444" />
                <Text className="text-red-500 text-xs font-bold ml-2">{locationError}</Text>
              </View>
            )}

            {coords && (
              <View className="bg-sky-50 border border-sky-100 rounded-xl p-2.5 mb-3 flex-row items-center">
                <Ionicons name="pin" size={14} color="#0284c7" />
                <Text className="text-primary text-xs font-bold ml-2">
                  {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                </Text>
              </View>
            )}

            <View className="flex-row gap-3">
              <Button label="← Back" onPress={goBack} variant="secondary" size="md" />
              <View className="flex-1">
                <Button label="Review →" onPress={goNext} fullWidth size="md" />
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── STEP 3: REVIEW ────────────────────────────────────────────── */}
      {currentStep === 3 && (
        <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 24 }}>
          <Text className="text-xl font-black text-slate-800 mb-1">Review & Submit</Text>
          <Text className="text-slate-400 text-sm mb-6">
            Confirm your report before submission. AI will auto-classify and route this to the correct department.
          </Text>

          {/* Review Card */}
          <View className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            {/* Image thumbnail */}
            {imageUri && (
              <Image
                source={{ uri: imageUri }}
                className="w-full h-44"
                resizeMode="cover"
              />
            )}

            <View className="p-5 gap-3">
              {/* Category */}
              <View className="flex-row justify-between items-center">
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">Category</Text>
                <View className="bg-sky-50 border border-sky-100 px-3 py-1 rounded-full">
                  <Text className="text-primary font-extrabold text-xs">{category}</Text>
                </View>
              </View>
              <View className="h-[1] bg-slate-100" />

              {/* Description */}
              <View>
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Description</Text>
                <Text className="text-slate-700 text-sm">
                  {description.trim() || '(None provided — AI will generate a summary)'}
                </Text>
              </View>
              <View className="h-[1] bg-slate-100" />

              {/* Location */}
              <View>
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">GPS Location</Text>
                {coords ? (
                  <View className="flex-row items-center">
                    <Ionicons name="pin" size={14} color="#e11d48" />
                    <Text className="text-slate-700 text-sm font-semibold ml-1">
                      {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                    </Text>
                  </View>
                ) : (
                  <Text className="text-red-400 text-sm">No location set</Text>
                )}
              </View>
            </View>
          </View>

          {/* AI notice */}
          <View className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6 flex-row items-start">
            <Ionicons name="sparkles" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
            <Text className="text-amber-700 text-xs font-medium ml-2 flex-1 leading-5">
              Gemini AI will automatically classify this issue, assign a ward, and route it to the relevant civic department.
            </Text>
          </View>

          {duplicateNotice && (
            <View className="bg-sky-50 border border-sky-100 rounded-2xl p-4 mb-4 flex-row items-start">
              <Ionicons name="information-circle" size={16} color="#0284c7" style={{ marginTop: 1 }} />
              <Text className="text-sky-700 text-xs font-medium ml-2 flex-1 leading-5">
                {duplicateNotice}
              </Text>
            </View>
          )}

          {/* Upload Progress */}
          {submitting && uploadProgress && (
            <View className="bg-sky-50 border border-sky-100 rounded-2xl p-4 mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs font-black text-primary uppercase tracking-wider">
                  Uploading Photo...
                </Text>
                <Text className="text-xs font-bold text-primary">
                  {uploadProgress.percent}%
                </Text>
              </View>
              {/* Progress bar track */}
              <View className="bg-sky-100 rounded-full h-2 overflow-hidden">
                <View
                  className="bg-primary h-2 rounded-full"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </View>
              <TouchableOpacity
                className="mt-3 items-center"
                onPress={handleCancelUpload}
              >
                <Text className="text-red-400 text-xs font-bold">Cancel Upload</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Upload Error + Retry */}
          {uploadError && !submitting && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-4 flex-row items-center">
              <Ionicons name="alert-circle" size={18} color="#ef4444" />
              <View className="flex-1 ml-3">
                <Text className="text-red-600 font-bold text-sm mb-1">Upload Failed</Text>
                <Text className="text-red-400 text-xs">{uploadError}</Text>
              </View>
            </View>
          )}

          <View className="flex-row gap-3">
            <Button label="← Back" onPress={goBack} variant="secondary" size="lg" disabled={submitting || checkingDuplicate} />
            <View className="flex-1">
              <Button
                label={
                  checkingDuplicate
                    ? 'Checking...'
                    : uploadError
                      ? 'Retry Upload'
                      : 'Submit Report'
                }
                onPress={handleSubmit}
                loading={submitting || checkingDuplicate}
                fullWidth
                size="lg"
              />
            </View>
          </View>
        </ScrollView>

      )}
    </KeyboardAvoidingView>
  );
}
