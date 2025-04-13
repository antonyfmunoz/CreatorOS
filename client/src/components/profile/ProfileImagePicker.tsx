import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Camera, Image as ImageIcon } from "lucide-react";

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
  const [showLibrary, setShowLibrary] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setImgSrc("");
      setSelectedFile(null);
      setCrop(undefined);
      setCompletedCrop(undefined);
      setShowLibrary(true);
    }
  }, [isOpen]);

  // When files are selected from the system file picker
  const handleFileSelected = (files: FileList | null) => {
    if (!files?.length) return;
    
    const file = files[0];
    setSelectedFile(file);
    
    // Read the file to display it
    const reader = new FileReader();
    reader.onloadend = () => {
      setImgSrc(reader.result as string);
      setShowLibrary(false); // Show cropping UI
    };
    reader.readAsDataURL(file);
  };

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

  // Apply the crop and close
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

  // Open system file picker
  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // If not open, don't render anything
  if (!isOpen) return null;

  // Render library view or cropping view
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <button 
          onClick={onClose}
          className="text-white hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
        <div className="font-semibold text-center">
          {showLibrary ? "Library" : "1 Photo Selected"}
        </div>
        <button 
          onClick={handleDone}
          className="text-blue-500 hover:text-blue-400 transition-colors"
          disabled={!completedCrop || showLibrary}
          style={{ opacity: !completedCrop || showLibrary ? 0.5 : 1 }}
        >
          Done
        </button>
      </div>
      
      {/* Content */}
      {showLibrary ? (
        // Library selection UI
        <div className="flex-1 flex flex-col">
          <div 
            className="flex-1 flex flex-col items-center justify-center bg-gray-900 p-6"
            onClick={openFilePicker}
          >
            <div className="text-center mb-6">
              <ImageIcon size={64} className="mx-auto mb-4 text-gray-500" />
              <p className="text-gray-400">Tap to select a photo from your library</p>
            </div>
          </div>
          
          {/* Bottom action buttons */}
          <div className="grid grid-cols-2 border-t border-gray-800">
            <button 
              className="py-4 text-center flex flex-col items-center justify-center gap-1 hover:bg-gray-900"
              onClick={openFilePicker}
            >
              <ImageIcon size={24} className="text-gray-300" />
              <span>Photo Library</span>
            </button>
            <button 
              className="py-4 text-center flex flex-col items-center justify-center gap-1 hover:bg-gray-900 border-l border-gray-800"
              onClick={openFilePicker}
            >
              <Camera size={24} className="text-gray-300" />
              <span>Take Photo</span>
            </button>
          </div>
          
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => handleFileSelected(e.target.files)}
          />
        </div>
      ) : (
        // Cropping UI
        <div className="flex-1 bg-gray-900 flex items-center justify-center">
          {!!imgSrc && (
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
          )}
        </div>
      )}
    </div>
  );
}