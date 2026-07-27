"use client"

import { useEffect, useState } from "react"
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react"
import {
  addDays,
  format,
  isSameDay,
  startOfDay,
  startOfToday,
  startOfYesterday,
} from "date-fns"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type MapDayPickerProps = {
  value: Date
  onChange: (next: Date) => void
}

export function defaultDay(): Date {
  return startOfToday()
}

function dayLabel(day: Date) {
  if (isSameDay(day, startOfToday())) return "Today"
  if (isSameDay(day, startOfYesterday())) return "Yesterday"
  return format(day, "MMM d, yyyy")
}

export function MapDayPicker({ value, onChange }: MapDayPickerProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const today = startOfToday()
  const yesterday = startOfYesterday()
  const isPastDay = mounted && !isSameDay(value, today)

  useEffect(() => {
    setMounted(true)
  }, [])

  const select = (day: Date) => {
    onChange(startOfDay(day))
    setOpen(false)
  }

  const step = (days: number) => {
    onChange(startOfDay(addDays(value, days)))
  }

  return (
    <div className="pointer-events-auto flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        onClick={() => step(-1)}
        aria-label="Previous day"
        className="bg-popover shadow-md"
      >
        <ChevronLeft />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="bg-popover shadow-md">
            <CalendarRange data-icon="inline-start" />
            {mounted ? dayLabel(value) : "Today"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="flex w-auto flex-col gap-0 p-0"
        >
          <div className="flex flex-col gap-1 p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => select(today)}
              className={cn(
                "justify-start font-normal",
                isSameDay(value, today) && "bg-muted font-medium"
              )}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => select(yesterday)}
              className={cn(
                "justify-start font-normal",
                isSameDay(value, yesterday) && "bg-muted font-medium"
              )}
            >
              Yesterday
            </Button>
          </div>
          <Separator />
          <Calendar
            mode="single"
            selected={value}
            onSelect={(day) => day && select(day)}
            defaultMonth={value}
            numberOfMonths={1}
            disabled={{ after: today }}
          />
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="icon"
        onClick={() => step(1)}
        disabled={!isPastDay}
        aria-label="Next day"
        className="bg-popover shadow-md"
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
