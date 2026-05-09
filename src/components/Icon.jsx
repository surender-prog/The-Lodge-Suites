import React from "react";
import {
  Sparkles, Coffee, Waves, Heart, Baby, Hotel, Award, Crown, Gem,
  Flame, Dumbbell, ChefHat, Wifi, Car, Briefcase, ShieldCheck, Globe,
  Instagram, Facebook, Twitter,
} from "lucide-react";

const ICON_MAP = {
  Sparkles, Coffee, Waves, Heart, Baby, Hotel, Award, Crown, Gem,
  Flame, Dumbbell, ChefHat, Wifi, Car, Briefcase, ShieldCheck, Globe,
  Instagram, Facebook, Twitter,
};

export const Icon = ({ name, ...rest }) => {
  const I = ICON_MAP[name];
  return I ? <I {...rest} /> : null;
};
