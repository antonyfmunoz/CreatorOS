import { useState } from 'react';
import { useAccessibility } from '@/hooks/use-accessibility';
import { 
  Accessibility, 
  Eye, 
  ZoomIn, 
  Move, 
  Contrast, 
  RotateCcw 
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';

export const AccessibilityToggle = () => {
  const { state, toggleAccessibilityMode } = useAccessibility();
  const [showPanel, setShowPanel] = useState(false);

  return (
    <>
      <button 
        className="accessibility-toggle" 
        onClick={() => setShowPanel(true)} 
        aria-label="Accessibility options"
      >
        <Accessibility className="h-6 w-6" />
      </button>

      {showPanel && (
        <AccessibilitySettingsPanel 
          open={showPanel} 
          onClose={() => setShowPanel(false)}
        />
      )}
    </>
  );
};

interface AccessibilitySettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export const AccessibilitySettingsPanel = ({ open, onClose }: AccessibilitySettingsPanelProps) => {
  const { 
    state, 
    toggleAccessibilityMode,
    setTextSize,
    setHighContrast,
    toggleReduceMotion,
    toggleScreenReaderOptimized,
    setAccessibilityLevel,
    resetToDefaults
  } = useAccessibility();

  const {
    enabled,
    textSize,
    highContrast,
    reduceMotion,
    screenReaderOptimized,
    accessibilityLevel
  } = state;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Accessibility className="h-5 w-5" /> 
            Accessibility Settings
          </DialogTitle>
          <DialogDescription>
            Customize your experience to improve accessibility.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Accessibility className="h-5 w-5" />
              <Label htmlFor="accessibility-mode">Enable Accessibility Mode</Label>
            </div>
            <Switch
              id="accessibility-mode"
              checked={enabled}
              onCheckedChange={toggleAccessibilityMode}
            />
          </div>

          <Separator />

          <div className="grid gap-2">
            <Label>Accessibility Level</Label>
            <Select
              value={accessibilityLevel}
              onValueChange={(value) => setAccessibilityLevel(value as any)}
              disabled={!enabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="enhanced">Enhanced</SelectItem>
                <SelectItem value="maximum">Maximum</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Choose a preset level or customize individual settings below.
            </p>
          </div>

          <Separator />

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <ZoomIn className="h-5 w-5" />
              <Label>Text Size</Label>
            </div>
            <Select
              value={textSize}
              onValueChange={(value) => setTextSize(value as any)}
              disabled={!enabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select text size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="large">Large</SelectItem>
                <SelectItem value="extra-large">Extra Large</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Contrast className="h-5 w-5" />
              <Label>Contrast Mode</Label>
            </div>
            <Select
              value={highContrast}
              onValueChange={(value) => setHighContrast(value as any)}
              disabled={!enabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select contrast mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High Contrast</SelectItem>
                <SelectItem value="maximum">Maximum Contrast</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Move className="h-5 w-5" />
              <Label htmlFor="reduce-motion">Reduce Motion</Label>
            </div>
            <Switch
              id="reduce-motion"
              checked={reduceMotion}
              onCheckedChange={toggleReduceMotion}
              disabled={!enabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              <Label htmlFor="screen-reader">Screen Reader Optimized</Label>
            </div>
            <Switch
              id="screen-reader"
              checked={screenReaderOptimized}
              onCheckedChange={toggleScreenReaderOptimized}
              disabled={!enabled}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={resetToDefaults}
            className="mr-auto"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Defaults
          </Button>
          <Button onClick={onClose}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};