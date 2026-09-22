import type { ChangeEvent } from 'react'

interface RangeSliderProps {
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
  ariaLabel: string
  size?: 'compact' | 'regular'
}

export default function RangeSlider({ min, max, step, value, onChange, ariaLabel, size = 'regular' }: RangeSliderProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))
  return <input type="range" min={min} max={max} step={step} value={value} onChange={handleChange} aria-label={ariaLabel} className={`range-slider range-slider-${size}`} />
}
