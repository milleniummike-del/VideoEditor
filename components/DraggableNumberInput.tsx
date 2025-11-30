
import React, { useState, useEffect, useRef, type FC, type ChangeEvent } from 'react';

interface DraggableNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  className?: string;
  inputClassName?: string;
}

const DraggableNumberInput: FC<DraggableNumberInputProps> = ({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  label,
  className = "",
  inputClassName = ""
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);
  const startValueRef = useRef<number>(0);
  const labelRef = useRef<HTMLLabelElement>(null);
  
  // Refs to hold latest props to avoid effect re-runs
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const propsRef = useRef({ min, max, step });

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { propsRef.current = { min, max, step }; }, [min, max, step]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (clientX: number, shiftKey: boolean, altKey: boolean) => {
      const dx = clientX - startXRef.current;
      const { min, max, step } = propsRef.current;
      
      // Modifiers for sensitivity
      let sensitivity = step < 1 ? 0.5 : 1;
      if (shiftKey) sensitivity *= 10;
      if (altKey) sensitivity *= 0.1;

      const delta = dx * step * sensitivity;
      let newValue = startValueRef.current + delta;

      // Clamp
      if (newValue < min) newValue = min;
      if (newValue > max) newValue = max;
      
      // Round to prevent floating point errors
      const stepString = step.toString();
      const decimals = stepString.includes('.') ? stepString.split('.')[1].length : 0;
      
      if (decimals > 0) {
          newValue = parseFloat(newValue.toFixed(decimals));
      } else {
          newValue = Math.round(newValue);
      }

      onChangeRef.current(newValue);
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault(); 
      handleMove(e.clientX, e.shiftKey, e.altKey);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault(); // Critical for iOS
      const touch = e.touches[0];
      handleMove(touch.clientX, false, false);
    };

    const handleEnd = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.touchAction = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    // Add touch listeners with passive: false to allow preventDefault
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('touchcancel', handleEnd);
    
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    document.body.style.touchAction = 'none'; // Disable browser handling of gestures

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
      document.removeEventListener('touchcancel', handleEnd);
      
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.touchAction = '';
    };
  }, [isDragging]);

  // Setup TouchStart manually to ensure passive: false (fix for iOS scrolling issue)
  useEffect(() => {
      const el = labelRef.current;
      if (!el) return;

      const onTouchStart = (e: TouchEvent) => {
          e.preventDefault(); // Stop scroll immediately
          setIsDragging(true);
          startXRef.current = e.touches[0].clientX;
          startValueRef.current = valueRef.current;
      };

      el.addEventListener('touchstart', onTouchStart, { passive: false });
      return () => {
          el.removeEventListener('touchstart', onTouchStart);
      };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only left click
    if (e.button !== 0) return;
    
    setIsDragging(true);
    startXRef.current = e.clientX;
    startValueRef.current = value;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    if (valStr === '') return;
    
    const newVal = parseFloat(valStr);
    if (!isNaN(newVal)) {
        onChange(newVal);
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label 
          ref={labelRef}
          className="text-[10px] text-gray-500 mb-1 block cursor-ew-resize select-none hover:text-blue-400 transition-colors w-max touch-none py-1"
          onMouseDown={handleMouseDown}
          title="Click/Touch and drag to adjust. Shift for faster, Alt for slower."
        >
          {label}
        </label>
      )}
      <input
        type="number"
        value={value}
        onChange={handleChange}
        step={step}
        min={min}
        max={max}
        onKeyDown={(e) => e.stopPropagation()} 
        className={`w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 ${inputClassName}`}
      />
    </div>
  );
};

export default DraggableNumberInput;
