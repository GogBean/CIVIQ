import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leftIcon,
  fullWidth = false,
}: ButtonProps) {
  const base = 'rounded-xl items-center justify-center flex-row';

  const variantClass = {
    primary: 'bg-primary shadow-sm shadow-sky-200',
    secondary: 'bg-slate-50 border border-slate-200',
    danger: 'bg-red-50 border border-red-100',
    ghost: 'bg-transparent',
  }[variant];

  const textClass = {
    primary: 'text-white',
    secondary: 'text-slate-700',
    danger: 'text-red-500',
    ghost: 'text-slate-500',
  }[variant];

  const sizeClass = {
    sm: 'px-4 py-2',
    md: 'px-5 py-3',
    lg: 'px-6 py-3.5',
  }[size];

  const textSize = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }[size];

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      className={`${base} ${variantClass} ${sizeClass} ${fullWidth ? 'w-full' : ''} ${isDisabled ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#0284c7'} size="small" />
      ) : (
        <View className="flex-row items-center gap-2">
          {leftIcon && leftIcon}
          <Text className={`font-bold ${textClass} ${textSize}`}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
