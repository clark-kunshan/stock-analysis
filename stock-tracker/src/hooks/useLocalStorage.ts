import { useState, useEffect, useCallback } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      const serialized = JSON.stringify(storedValue);
      window.localStorage.setItem(key, serialized);
    } catch (e) {
      console.error('localStorage写入失败:', e);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}

export function useLocalStorageWithFilter<T>(
  key: string, 
  initialValue: T,
  filter: (value: T) => T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      const filtered = filter(storedValue);
      const serialized = JSON.stringify(filtered);
      window.localStorage.setItem(key, serialized);
    } catch (e) {
      console.error('localStorage写入失败:', e);
    }
  }, [key, storedValue, filter]);

  return [storedValue, setStoredValue];
}
