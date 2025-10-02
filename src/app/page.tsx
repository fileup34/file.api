"use client";
import { useState, useEffect } from 'react';
import { Card, RangeSlider, Label, Button } from 'flowbite-react';
import { useSearchParams } from 'next/navigation';
import { Head } from 'next/document';

export default function Home() {

  const searchParams = useSearchParams()
  const userEmail = searchParams.get('email')
  // Constants for plan features
  const basePrices = {
    word: 9.99 / 10000,
    image: 9.99 / 100,
    minute: 9.99 / 100,
    character: 9.99 / 200000,
  };

  // Discounts for larger quantities
  const discountThresholds = {
    silver: { word: 10000, image: 100, minute: 100, character: 400000, discount: 0.05 },
    gold: { word: 10000, image: 100, minute: 100, character: 500000, discount: 0.1 },
  };

  // State hooks for each feature
  const [words, setWords] = useState(10000);
  const [images, setImages] = useState(100);
  const [minutes, setMinutes] = useState(100);
  const [characters, setCharacters] = useState(200000);
  const [totalPrice, setTotalPrice] = useState(9.99);

  // Calculate total price based on selected features
  useEffect(() => {
    let price = words * basePrices.word + images * basePrices.image + minutes * basePrices.minute + characters * basePrices.character;

    // Apply discount if thresholds are met
    if (characters >= discountThresholds.gold.character) {
      price *= (1 - discountThresholds.gold.discount);
    } else if (characters >= discountThresholds.silver.character) {
      price *= (1 - discountThresholds.silver.discount);
    }

    setTotalPrice(price);
  }, [words, images, minutes, characters]);
  const handlePurchase = async () => { 
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          words,
          images,
          minutes,
          characters,
          userEmail,
          price: totalPrice,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const { url } = await response.json();
      // Redirect the parent frame
      window.parent.location.href = url;
    } catch (error) {
      console.error('Failed to initiate purchase:', error);
    }
  };
  return (
    <Card style={{ background: 'url(/bg.webp) no-repeat center center', backgroundSize: 'cover' }}>
    
      <h2 className='text-2xl font-bold'>Customise your plan</h2>
      
      {/* Words Slider */}
      <Label>Words: {words}</Label>
      <RangeSlider
        min={100}
        max={100000}
        value={words}
        onChange={(e) => setWords(Number(e.target.value))}
      />
      
      {/* Images Slider */}
      <Label>Images: {images}</Label>
      <RangeSlider
        min={1}
        max={10000}
        value={images}
        onChange={(e) => setImages(Number(e.target.value))}
      />
      
      {/* Minutes Slider */}
      <Label>Minutes: {minutes}</Label>
      <RangeSlider
        min={10}
        max={10000}
        value={minutes}
        onChange={(e) => setMinutes(Number(e.target.value))}
      />
      
      {/* Characters Slider */}
      <Label>Characters: {characters}</Label>
      <RangeSlider
        min={1000}
        max={100000}
        value={characters}
        onChange={(e) => setCharacters(Number(e.target.value))}
      />
      
      <Button onClick={handlePurchase} style={{background: 'linear-gradient(180deg, #a26ef7 0, #763cd4 100%) !important'}} className='magic-bg h-max w-max rounded-xl text-[14px] leading-[22px] text-white font-semibold py-3 px-[25px]'>Purchase for €{totalPrice.toFixed(2)}</Button>
    </Card>
  );
}
