import { cn } from 'cn';
import {
  Bold,
  Brackets,
  Code,
  Heading2,
  ImagePlus,
  Link,
  List,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { FormatKind } from './format';

const BUTTONS: { kind: FormatKind; icon: LucideIcon }[] = [
  { kind: 'heading', icon: Heading2 },
  { kind: 'bold', icon: Bold },
  { kind: 'bulletList', icon: List },
  { kind: 'taskList', icon: ListChecks },
  { kind: 'link', icon: Link },
  { kind: 'wikiLink', icon: Brackets },
  { kind: 'code', icon: Code },
];

/** The phone's formatting bar (K1), which the editor layout keeps just above the keyboard. */
export function FormatToolbar({
  onFormat,
  onPhotos,
  className,
}: {
  onFormat: (kind: FormatKind) => void;
  onPhotos?: (files: File[]) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const button = 'h-10 min-w-9 flex-1';
  return (
    <div
      role="toolbar"
      aria-label={t('editor.format.toolbar')}
      className={cn('flex overflow-x-auto border-t bg-background px-1', className)}
    >
      {BUTTONS.map(({ kind, icon: Icon }) => (
        <Button
          key={kind}
          variant="ghost"
          size="icon"
          className={button}
          aria-label={t(`editor.format.${kind}`)}
          // Taking focus would blur the editor and drop the keyboard.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat(kind)}
        >
          <Icon />
        </Button>
      ))}
      {onPhotos && (
        <Button variant="ghost" size="icon" className={button} asChild>
          <label>
            <ImagePlus />
            <span className="sr-only">{t('editor.format.photo')}</span>
            {/* No capture attribute: the phone offers the camera and the photo library. */}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                onPhotos([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </label>
        </Button>
      )}
    </div>
  );
}
