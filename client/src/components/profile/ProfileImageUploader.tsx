import { useState, useRef, RefObject } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera } from "lucide-react";

interface ProfileImageUploaderProps {
  imageUrl?: string;
  onUpload: (file: File) => void;
  fileInputRef: RefObject<HTMLInputElement>;
}

export default function ProfileImageUploader({ 
  imageUrl,
  onUpload,
  fileInputRef
}: ProfileImageUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(imageUrl);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Create a preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
    
    // Pass the file to parent component
    onUpload(file);
  };

  return (
    <div className="relative">
      {/* Hidden file input */}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      
      {/* Avatar display */}
      <div className="relative">
        <Avatar className="w-24 h-24 border border-gray-200">
          <AvatarImage 
            src={previewUrl} 
            alt="Profile" 
            className="object-cover" 
          />
          <AvatarFallback className="bg-gray-100">
            <Camera className="h-8 w-8 text-gray-500" />
          </AvatarFallback>
        </Avatar>
        
        {/* Optional overlay effect */}
        <div className="absolute inset-0 bg-black bg-opacity-0 rounded-full hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
          {/* You can add an icon here if desired */}
        </div>
      </div>
    </div>
  );
}