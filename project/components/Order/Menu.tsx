import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Input } from '@rneui/themed'
import { Session } from '@supabase/supabase-js'
import { View, Text, Image, TouchableOpacity, FlatList, ActivityIndicator, Alert, } from 'react-native';
import { styles } from './styles';

interface MenuItem {
    id: string;
    name: string;
    description: string;
    image: string;
    imageUrl: string;
    cost: number;
}

export default function Menu({ session }: { session: Session }) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [imageCache, setImageCache] = useState<{ [key: string]: string }>({})
  const [quantities, setQuantities] = useState<{ [key: string]: number }>({})


  useEffect(() => { fetchMenuItems();
  }, []);

  async function fetchMenuItems() {
  if (!session?.user) throw new Error('No user on the session!')
    try {
      const { data, error } = await supabase.from('Menu').select('*');
      if (error) throw new Error(error.message);

      // Fetch URLs for images
      const itemsWithUrls = await Promise.all(
        data.map(async (item: MenuItem) => {
          const { data: imageUrl } = await supabase.storage
            .from('MenuItemImages')
            .getPublicUrl(item.image);

          if (!imageUrl) throw new Error('Error fetching image URL');

          return {
            ...item,
            imageUrl: imageUrl.publicUrl,
          };
        })
      );

      setMenuItems(itemsWithUrls);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error fetching menu items:', error.message);
      } else {
        console.error('Error fetching menu items:', error);
      }
    } finally {
      setLoading(false);
    }
  }

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 0) return; // Prevent negative quantities

    setQuantities((prev) => ({ ...prev, [itemId]: newQuantity }));

    try {
      if (newQuantity === 0) {
        await supabase.from('OrderItems_testing').delete().eq('menuItem_id', itemId);
      } else {
        await supabase.from('OrderItems_testing').upsert({
          menuItem_id: itemId,
          quantity: newQuantity,
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error updating quantity:', error.message);
      } else {
        console.error('Error updating quantity:', error);
      }
    }
  };

  const createOrder = async () => {
    try {
      // Step 1: Create a new order in the `orders` table
      const { data: orderData, error: orderError } = await supabase
        .from('Orders_testing')
        .insert({ user_id: session.user.id, created_at: new Date() })
        .select();
  
      if (orderError) throw new Error(orderError.message);
  
      const orderId = orderData[0].id;
  
      // Step 2: Add each item with a quantity > 0 to the `orderitems` table
      const orderItems = Object.entries(quantities)
        .filter(([_, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => ({
          menuItem_id: itemId,
          order_id: orderId,
          quantity,
        }));
  
      if (orderItems.length > 0) {
        const { error: itemsError } = await supabase.from('OrderItems_testing').insert(orderItems);
        if (itemsError) throw new Error(itemsError.message);
      }
  
      Alert.alert('Order Created', `Order ID: ${orderId}`);
      setQuantities({});
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error creating order:', error.message);
        Alert.alert('Error', error.message);
      } else {
        console.error('Error creating order:', error);
        Alert.alert('Error', 'An unknown error occurred');
      }
    }
  };

  const renderMenuItem = ({ item }: { item: MenuItem & { imageUrl: string } }) => {
    const quantity = quantities[item.id] || 0;

    return (
      <View style={styles.menuItem}>
        <Image source={{ uri: item.imageUrl }} style={styles.image} />
        <View style={styles.textContainer}>
            <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.cost}>${item.cost}</Text>
            </View>
          <Text style={styles.description}>{item.description}</Text>
            <View style={styles.quantityContainer}>
              <Button title="-" buttonStyle={styles.button} onPress={() => updateQuantity(item.id, quantity - 1)} />
              <Text style={styles.quantityText}>{quantity}</Text>
              <Button title="+" buttonStyle={styles.button} onPress={() => updateQuantity(item.id, quantity + 1)} />
            </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return <Text>Loading menu...</Text>;
  }

  return (
    <FlatList
      data={menuItems}
      keyExtractor={(item) => item.id.toString()}
      renderItem={renderMenuItem}
      contentContainerStyle={styles.container}
      ListFooterComponent={
        <Button title="Create Order" onPress={createOrder} color="#28a745" />
      }
    />
  );
}

/*
  useEffect(() => {
    if (session) getMenu()
  }, [session])

    useEffect(() => {
        getMenu();
    }, []);
  async function getMenu() {
    try {
      setLoading(true)
      if (!session?.user) throw new Error('No user on the session!')

      const { data, error } = await supabase.from('Menu').select('id, name, description, image')
      console.debug(data)
      if (error) throw error
      setMenuItems(data || [])
    } catch (error) {
        console.error('Error fetching menu items:', error)
    } finally {
        setLoading(false)
    }
  }

  async function fetchImageUrl(imagePath: string): Promise<string> {
    if (imageCache[imagePath]) {
      return imageCache[imagePath] // Return cached URL if available
    }
    try {
      const { data } = supabase.storage.from('MenuItemImages').getPublicUrl(imagePath);
      const publicUrl = data.publicUrl
      setImageCache((prevCache) => ({ ...prevCache, [imagePath]: publicUrl }));
      console.error(publicUrl);
      return publicUrl
    } catch (error) {
      console.error('Error fetching image URL:', error)
      return ''
    }
  }

  const renderMenuItem = ({ item }: { item: MenuItem }) => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
      (async () => {
        const url = await fetchImageUrl(item.image);
        setImageUrl(url);
      })();
    }, [item.image]);

    return (
      <TouchableOpacity style={styles.itemContainer}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.itemImage} />
        ) : (
          <ActivityIndicator size="small" color="#000" />
        )}
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDescription}>{item.description}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#000" />
      ) : (
        <FlatList
          data={menuItems}
          renderItem={renderMenuItem}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 200, // Adjust height for menu
    backgroundColor: '#fff',
    paddingVertical: 10,
  },
  listContainer: {
    paddingHorizontal: 10,
  },
  itemContainer: {
    width: 150,
    marginRight: 10,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  itemImage: {
    width: 100,
    height: 100,
    resizeMode: 'cover',
    borderRadius: 8,
    marginBottom: 10,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  itemDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});
*/