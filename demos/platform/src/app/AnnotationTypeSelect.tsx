import { useState, ChangeEvent } from "react";

interface SelectProps {
  onChange: (selectedValue: string) => void;
}

export default function AnnotationTypeSelect({ onChange }: SelectProps) {
  const [selectedValue, setSelectedValue] = useState("spelling");

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedValue(value);
    onChange(value);
  };

  return (
    <select value={selectedValue} onChange={handleChange} className="annotation-type-select">
      <option value="spelling">Spelling</option>
      <option value="grammar">Grammar</option>
      <option value="other">Other</option>
    </select>
  );
}
