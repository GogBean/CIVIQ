import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

export default function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <View className="flex-row items-center justify-center px-4 py-3">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;

        return (
          <React.Fragment key={step}>
            {/* Step circle */}
            <View className="items-center">
              <View
                className={`w-7 h-7 rounded-full items-center justify-center ${
                  isCompleted
                    ? 'bg-emerald-500'
                    : isActive
                    ? 'bg-primary'
                    : 'bg-slate-200'
                }`}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Text
                    className={`text-xs font-black ${
                      isActive ? 'text-white' : 'text-slate-400'
                    }`}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                className={`text-[9px] font-bold mt-1 ${
                  isActive ? 'text-primary' : isCompleted ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {step}
              </Text>
            </View>

            {/* Connecting line */}
            {index < steps.length - 1 && (
              <View
                className={`h-[2px] flex-1 mx-1 mb-3 rounded-full ${
                  index < currentStep ? 'bg-emerald-400' : 'bg-slate-200'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
