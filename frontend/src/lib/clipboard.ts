import { toast } from "@/lib/toast";

export async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied.`);
  } catch {
    toast.error(`Failed to copy ${label.toLowerCase()}.`);
  }
}
