import { Calendar as CalendarIcon } from "lucide-react";
import { DateTime } from "luxon";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

interface DatePickerProps {
  date: Date;
  setDate: (date: Date) => void;
  id?: string;
  name?: string;
  maxDate?: Date;
}

export function DatePicker({
  date,
  setDate,
  id,
  name,
  maxDate,
}: DatePickerProps) {
  const formattedDate = DateTime.fromJSDate(date).toLocaleString(
    DateTime.DATE_FULL
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? formattedDate : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(date) => date && setDate(date)}
          initialFocus
          toDate={maxDate}
        />
      </PopoverContent>
      <input type="hidden" name={name} value={date.toISOString()} />
    </Popover>
  );
}
