import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { api, Flip } from '../services/api';

type RootStackParamList = {
  ListItem: { flip: Flip };
};

interface ListingSuggestion {
  flip_id: number;
  suggested_title: string;
  description: string;
  ebay_category: { category_id: number; category_name: string; category_key: string };
  testing_checklist: string[];
}

export default function ListItemScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ListItem'>>();
  const { flip } = route.params;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [suggestion, setSuggestion] = useState<ListingSuggestion | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    loadSuggestion();
  }, []);

  const loadSuggestion = async () => {
    try {
      const data = await api.getFlipListingSuggestion(flip.id);
      setSuggestion(data);
      setTitle(data.suggested_title);
      setDescription(data.description);
      setCategoryId(data.ebay_category.category_id.toString());
      setCategoryName(data.ebay_category.category_name);
    } catch (error) {
      console.error('Failed to load suggestion:', error);
      Alert.alert('Error', 'Failed to load listing suggestion');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 12,
    });

    if (!result.canceled) {
      const newImages = result.assets.map(asset => asset.uri);
      setImages(prev => [...prev, ...newImages].slice(0, 12));
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your camera');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      setImages(prev => [...prev, result.assets[0].uri].slice(0, 12));
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title');
      return;
    }
    if (!price.trim() || isNaN(parseFloat(price))) {
      Alert.alert('Required', 'Please enter a valid price');
      return;
    }
    if (images.length === 0) {
      Alert.alert('Required', 'Please add at least one photo');
      return;
    }

    setSubmitting(true);

    try {
      // TODO: Upload images to eBay first, then create listing
      // For now, we'll just create the listing with placeholder URLs
      const result = await api.createEbayListing(flip.id, {
        title: title.trim(),
        description: description.trim(),
        category_id: categoryId,
        price: parseFloat(price),
        condition: 'used',
        image_urls: images, // These would need to be uploaded first
      });

      if (result.success) {
        Alert.alert(
          'Listed!',
          `Your item is now live on eBay!\n\n${result.ebay_url}`,
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        if (result.requires_manual_listing) {
          Alert.alert(
            'Manual Listing Required',
            result.error || 'Please complete the listing manually on eBay',
          );
        } else {
          Alert.alert('Error', result.error || 'Failed to create listing');
        }
      }
    } catch (error) {
      console.error('Listing error:', error);
      Alert.alert('Error', 'Failed to create listing. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4ecca3" />
        <Text style={styles.loadingText}>Loading listing details...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>List on eBay</Text>
        <Text style={styles.headerSubtitle}>{flip.item_name}</Text>
      </View>

      {/* Photos Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Photos ({images.length}/12)</Text>
        <Text style={styles.sectionHint}>Add up to 12 photos. First photo is the main image.</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.imagesScroll}
        >
          {/* Add Photo Buttons */}
          <TouchableOpacity style={styles.addPhotoBtn} onPress={takePhoto}>
            <Text style={styles.addPhotoIcon}>📷</Text>
            <Text style={styles.addPhotoText}>Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.addPhotoBtn} onPress={pickImage}>
            <Text style={styles.addPhotoIcon}>🖼️</Text>
            <Text style={styles.addPhotoText}>Gallery</Text>
          </TouchableOpacity>

          {/* Selected Images */}
          {images.map((uri, index) => (
            <View key={index} style={styles.imageContainer}>
              <Image source={{ uri }} style={styles.imageThumb} />
              {index === 0 && (
                <View style={styles.mainBadge}>
                  <Text style={styles.mainBadgeText}>MAIN</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeImage(index)}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Category */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Category</Text>
        <View style={styles.categoryBox}>
          <Text style={styles.categoryText}>{categoryName}</Text>
        </View>
      </View>

      {/* Title */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Enter listing title"
          placeholderTextColor="#666"
          maxLength={80}
        />
        <Text style={styles.charCount}>{title.length}/80 characters</Text>
      </View>

      {/* Price */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Price</Text>
        <View style={styles.priceInputContainer}>
          <Text style={styles.priceCurrency}>$</Text>
          <TextInput
            style={styles.priceInput}
            value={price}
            onChangeText={setPrice}
            placeholder="0.00"
            placeholderTextColor="#666"
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Description</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          value={description}
          onChangeText={setDescription}
          placeholder="Enter listing description"
          placeholderTextColor="#666"
          multiline
          textAlignVertical="top"
        />
      </View>

      {/* Testing Checklist */}
      {suggestion?.testing_checklist && suggestion.testing_checklist.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Testing Checklist</Text>
          <Text style={styles.sectionHint}>Make sure you've tested these before listing:</Text>
          {suggestion.testing_checklist.map((item, index) => (
            <View key={index} style={styles.checklistItem}>
              <Text style={styles.checklistBullet}>☐</Text>
              <Text style={styles.checklistText}>{item}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Submit Button */}
      <TouchableOpacity
        style={[
          styles.submitBtn,
          (submitting || images.length === 0) && styles.submitBtnDisabled,
        ]}
        onPress={handleSubmit}
        disabled={submitting || images.length === 0}
      >
        {submitting ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.submitBtnText}>
            {images.length === 0 ? 'Add Photos to List' : 'List on eBay'}
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionHint: {
    color: '#888',
    fontSize: 13,
    marginBottom: 12,
  },
  imagesScroll: {
    flexDirection: 'row',
    marginTop: 8,
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  addPhotoIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  addPhotoText: {
    color: '#888',
    fontSize: 11,
  },
  imageContainer: {
    position: 'relative',
    marginRight: 8,
  },
  imageThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  mainBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#4ecca3',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mainBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ff6b6b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  categoryBox: {
    backgroundColor: '#1a1a2e',
    padding: 12,
    borderRadius: 8,
  },
  categoryText: {
    color: '#4ecca3',
    fontSize: 14,
  },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  charCount: {
    color: '#666',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  priceCurrency: {
    color: '#4ecca3',
    fontSize: 24,
    fontWeight: 'bold',
    paddingLeft: 14,
  },
  priceInput: {
    flex: 1,
    padding: 14,
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  descriptionInput: {
    minHeight: 150,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  checklistBullet: {
    color: '#888',
    fontSize: 16,
    marginRight: 8,
  },
  checklistText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  submitBtn: {
    backgroundColor: '#4ecca3',
    margin: 16,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#333',
  },
  submitBtnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bottomPadding: {
    height: 40,
  },
});
