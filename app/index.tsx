// app/index.tsx

import { Redirect } from 'expo-router';
import React from 'react';

export default function IndexRedirect() {
  // Always land on the Ecommerce tab
  return <Redirect href="/(auth)/login" />;
}
