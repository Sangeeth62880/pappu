import React from 'react';
import { View, StyleSheet } from 'react-native';
import PeopleScreen from '../components/PeopleScreen';
import CoinButton from '../components/ui/CoinButton';
import { colors } from '../theme/tokens';

export default function PersonDetailScreen({ route, navigation, ...props }) {
  const contactId = route?.params?.contactId;

  return (
    <View style={styles.container}>
      <PeopleScreen
        token={props.token || route?.params?.token}
        initialContactId={contactId}
        onBack={() => navigation.goBack()}
        onShowToast={props.onShowToast || route?.params?.onShowToast}
        onTransactionMutated={props.onTransactionMutated || route?.params?.onTransactionMutated}
      />
      {/* Voice Assistant Button on PersonDetailScreen */}
      <View style={styles.floatingCoin} pointerEvents="box-none">
        <CoinButton
          onOpenAssistant={(params) => navigation.navigate('Assistant', params || { autoRecord: true })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  floatingCoin: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    zIndex: 50,
  },
});
