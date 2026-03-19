import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function App() {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handlePress = () => {
    setScale(scale === 1 ? 1.2 : 1);
    setRotation(rotation + 45);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CSS Animations</Text>
      <Text style={styles.subtitle}>
        Click the box below to animate it
      </Text>

      <View 
        style={[
          styles.box,
          {
            transform: [
              { scale },
              { rotate: `${rotation}deg` }
            ],
            // @ts-ignore
            transition: 'all 0.3s ease-in-out',
          }
        ]}
      >
        <Text style={styles.boxText}>✨</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handlePress}>
        <Text style={styles.buttonText}>Animate</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Note: Web animations use CSS transitions.
        Native animations would use Animated API.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  box: {
    width: 120,
    height: 120,
    backgroundColor: '#007AFF',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  boxText: {
    fontSize: 48,
  },
  button: {
    backgroundColor: '#34C759',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  note: {
    marginTop: 40,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
