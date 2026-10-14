import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import { colors } from '../../theme/tokens';

/**
 * Standard Icon Component for Pappu.
 * Strictly one family: Feather (rounded outline, 24px standard, ink color).
 */
export default function Icon({
  name,
  size = 24,
  color = colors.ink,
  style,
  ...props
}) {
  return (
    <Feather
      name={name}
      size={size}
      color={color}
      style={style}
      {...props}
    />
  );
}
