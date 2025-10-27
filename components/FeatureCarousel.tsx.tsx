import React, { useState, useRef, useEffect } from 'react';
import { Dimensions, StyleSheet, View, ScrollView, Animated } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const features = [
  {
    title: "Full Business Management",
    description: "Manage inventory, run POS operations, and access real-time business analytics in one powerful platform.",
    icon: "briefcase-outline",
    color: Colors.light.primary,
  },
  {
    title: "Effortless Invoicing",
    description: "Create, send, and track professional invoices in seconds for faster payments.",
    icon: "document-text-outline",
    color: Colors.light.primary,
  },
  {
    title: "Expense Tracking",
    description: "Monitor all business expenses in one place for better budgeting and control.",
    icon: "pie-chart-outline",
    color: Colors.light.secondary,
  },
  {
    title: "Real-time Analytics",
    description: "Get valuable insights into your business performance with up-to-date data.",
    icon: "stats-chart-outline",
    color: Colors.light.success,
  },
  {
    title: "Accounting Made Easy",
    description: "Simplify bookkeeping and generate detailed financial reports effortlessly.",
    icon: "calculator-outline",
    color: Colors.light.warning,
  }
];

export default function FeatureCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextIndex = (currentIndex + 1) % features.length;
      scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
      setCurrentIndex(nextIndex);
    }, 4000);

    return () => clearInterval(interval);
  }, [currentIndex]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {features.map((item, index) => (
          <View key={index} style={[styles.slide, { width }]}>
            <View style={styles.slideContent}>
              <View style={styles.iconContainer}>
                <Ionicons name={item.icon} size={36} color={item.color} />
              </View>
              <ThemedText type="title" style={[styles.slideTitle, { color: item.color }]}>
                {item.title}
              </ThemedText>
              <ThemedText style={styles.slideDescription}>
                {item.description}
              </ThemedText>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 220,
    marginBottom: 16,
  },
  slide: {
    height: '100%',
    paddingHorizontal: 12,
  },
  slideContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    backgroundColor: 'white',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 2,
  },
  slideTitle: {
    textAlign: 'center',
    marginBottom: 6,
    fontSize: 18,
    fontWeight: '700',
  },
  slideDescription: {
    textAlign: 'center',
    color: Colors.light.gray500,
    fontSize: 14,
    maxWidth: '90%',
  },
});
