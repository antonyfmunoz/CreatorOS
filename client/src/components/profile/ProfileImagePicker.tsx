import { useState, useRef, useCallback, useEffect } from "react";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Check, X } from "lucide-react";

interface ProfileImagePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onImageSelected: (file: File) => void;
}

export default function ProfileImagePicker({ 
  isOpen, 
  onClose, 
  onImageSelected 
}: ProfileImagePickerProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const [imgSrc, setImgSrc] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Open file picker when the component is shown
  useEffect(() => {
    if (isOpen && !imgSrc) {
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 100);
    }
  }, [isOpen, imgSrc]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setImgSrc("");
      setSelectedFile(null);
      setCrop(undefined);
      setCompletedCrop(undefined);
    }
  }, [isOpen]);

  // Create initial centered crop
  const createFixedCenterCrop = useCallback(
    (mediaWidth: number, mediaHeight: number) => {
      // Use the smaller dimension to create a square crop
      const size = Math.min(mediaWidth, mediaHeight);
      
      // Calculate position to center crop
      const x = (mediaWidth - size) / 2;
      const y = (mediaHeight - size) / 2;
      
      return {
        unit: 'px',
        x,
        y,
        width: size,
        height: size,
      } as Crop;
    },
    [],
  );

  // When image loads, set up initial crop
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    
    // Set initial fixed crop 
    const initialCrop = createFixedCenterCrop(width, height);
    setCrop(initialCrop);
    setCompletedCrop(initialCrop);
  }

  // Handle image file selection
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      onClose();
      return;
    }
    
    setSelectedFile(file);
    
    // Read the file to display it
    const reader = new FileReader();
    reader.onloadend = () => {
      setImgSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  // Convert the cropped area to a File object
  const getCroppedImg = useCallback(() => {
    if (!imgRef.current || !completedCrop || !selectedFile) return null;
    
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    // Set canvas size to be square
    const size = completedCrop.width;
    canvas.width = size;
    canvas.height = size;
    
    // Optional: Create a circular clipping path
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.clip();
    
    // Draw the cropped image onto the canvas
    ctx.drawImage(
      image,
      completedCrop.x,
      completedCrop.y,
      completedCrop.width,
      completedCrop.height,
      0,
      0,
      size,
      size
    );
    
    // Convert canvas to blob
    return new Promise<File>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], selectedFile.name, { 
          type: "image/png" 
        });
        resolve(file);
      }, 'image/png');
    });
  }, [completedCrop, selectedFile]);

  // Apply the crop
  async function handleDone() {
    try {
      const croppedFile = await getCroppedImg();
      if (croppedFile) {
        onImageSelected(croppedFile);
        onClose();
      }
    } catch (error) {
      console.error('Error cropping image:', error);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal={true}>
      <DialogContent className="w-full h-[100dvh] max-w-full p-0 rounded-none border-none overflow-hidden bg-background">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <button 
              onClick={onClose}
              className="text-primary hover:text-primary/80 transition-colors"
            >
              Cancel
            </button>
            <div className="font-semibold text-center">
              {selectedFile ? "Move and Scale" : "Select Photo"}
            </div>
            <button 
              onClick={handleDone}
              className="text-primary hover:text-primary/80 transition-colors"
              disabled={!completedCrop}
            >
              Done
            </button>
          </div>
          
          {/* Content */}
          <div className="flex-1 bg-gray-900 flex items-center justify-center">
            {!!imgSrc ? (
              <ReactCrop
                crop={crop}
                locked={true}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                circularCrop
                className="h-full w-full flex items-center justify-center"
              >
                <img
                  ref={imgRef}
                  alt="Upload"
                  src={imgSrc}
                  onLoad={onImageLoad}
                  className="max-w-full max-h-full object-contain"
                />
              </ReactCrop>
            ) : (
              <div className="p-4 text-center text-gray-400">
                Select a photo to crop
              </div>
            )}
          </div>
        </div>
        
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />
      </DialogContent>
    </Dialog>
  );
}