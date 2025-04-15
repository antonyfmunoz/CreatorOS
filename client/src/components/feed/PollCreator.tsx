import React, { useState } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PollCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (pollData: PollData) => void;
}

export interface PollData {
  question: string;
  options: string[];
}

export const PollCreator = ({ isOpen, onClose, onSave }: PollCreatorProps) => {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["Yes", "No"]);
  const { toast } = useToast();

  const handleAddOption = () => {
    if (options.length < 4) {
      setOptions([...options, ""]);
    } else {
      toast({
        title: "Maximum options reached",
        description: "You can only add up to 4 options in a poll",
      });
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = [...options];
      newOptions.splice(index, 1);
      setOptions(newOptions);
    } else {
      toast({
        title: "Minimum options required",
        description: "A poll must have at least 2 options",
      });
    }
  };

  const handleSave = () => {
    if (!question.trim()) {
      toast({
        title: "Question required",
        description: "Please enter a poll question",
        variant: "destructive",
      });
      return;
    }

    // Check if all options have content
    const emptyOptions = options.filter(option => !option.trim());
    if (emptyOptions.length > 0) {
      toast({
        title: "Empty options",
        description: "All poll options must have content",
        variant: "destructive",
      });
      return;
    }

    onSave({ question, options });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 overflow-hidden bg-black text-white w-full max-w-md max-h-[90vh] sm:max-h-[600px]">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-gray-800">
            <button 
              onClick={onClose}
              className="p-1 rounded-full"
            >
              <X className="h-6 w-6" />
            </button>
            <h2 className="text-lg font-medium">Caption</h2>
            <button 
              onClick={handleSave}
              className="text-blue-500 font-semibold px-2"
            >
              OK
            </button>
          </div>

          {/* Poll content */}
          <div className="flex-1 overflow-y-auto p-4">
            <Input
              placeholder="Ask a poll question..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="bg-transparent border-0 border-b border-gray-700 rounded-none text-white placeholder-gray-500 mb-4 px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />

            {/* Poll options */}
            <div className="space-y-3 mt-6">
              {options.map((option, index) => (
                <div key={index} className="relative">
                  <Input
                    placeholder={index === 0 ? "Yes" : index === 1 ? "No" : `Option ${index + 1}`}
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    className="bg-gray-800 text-white placeholder-gray-500 rounded-md pr-10"
                  />
                  {index > 1 && (
                    <button 
                      onClick={() => handleRemoveOption(index)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add another option button */}
            <button 
              onClick={handleAddOption}
              className="w-full mt-4 py-3 border border-dashed border-gray-600 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-300"
            >
              <span className="flex items-center">
                <Plus className="h-4 w-4 mr-2" />
                Add another option...
              </span>
            </button>

            <p className="text-xs text-gray-500 mt-4">
              Polls cannot be edited after posting.
            </p>
            
            <div className="flex justify-end mt-2">
              <button className="text-sm text-red-500">
                Delete
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};