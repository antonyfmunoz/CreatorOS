import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Check } from "lucide-react";

interface SimpleImagePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onImageSelected: (file: File) => void;
}

export default function SimpleImagePicker({
  isOpen,
  onClose,
  onImageSelected
}: SimpleImagePickerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle confirmation
  const handleConfirm = () => {
    if (selectedFile) {
      onImageSelected(selectedFile);
      onClose();
      
      // Reset state
      setTimeout(() => {
        setPreviewUrl(null);
        setSelectedFile(null);
      }, 100);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    onClose();
    
    // Reset state
    setTimeout(() => {
      setPreviewUrl(null);
      setSelectedFile(null);
    }, 100);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <button onClick={handleCancel} className="text-white">
          Cancel
        </button>
        <h2 className="text-white font-semibold">
          {previewUrl ? "Confirm Photo" : "Select Photo"}
        </h2>
        {previewUrl ? (
          <button onClick={handleConfirm} className="text-blue-500">
            Done
          </button>
        ) : (
          <div style={{ width: "42px" }}></div> 
        )}
      </div>

      {/* Content */}
      <div className="flex-1 bg-gray-900 flex flex-col items-center justify-center p-4">
        {previewUrl ? (
          // Preview selected image
          <div className="w-full max-w-sm">
            <div className="relative pb-[100%] overflow-hidden rounded-full mx-auto mb-6 border-2 border-white" style={{ maxWidth: "250px" }}>
              <img 
                src={previewUrl} 
                alt="Preview" 
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
            <div className="flex justify-center gap-4">
              <Button 
                variant="outline" 
                onClick={handleCancel}
                className="flex items-center gap-2 text-white border-white hover:bg-gray-800"
              >
                <X size={16} />
                Cancel
              </Button>
              <Button 
                onClick={handleConfirm}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Check size={16} />
                Use This Photo
              </Button>
            </div>
          </div>
        ) : (
          // Select an image
          <div className="text-center">
            <p className="text-white mb-6">
              Select a profile photo from your device
            </p>
            <Button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Choose from Library
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}