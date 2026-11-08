// Web keeps page analysis in memory only (there is no native analyzer there).
export async function readMobileReaderPageAnalysisText(_name: string): Promise<string | null> {
  void _name;
  return null;
}

export async function writeMobileReaderPageAnalysisText(_name: string, _text: string): Promise<void> {
  void _name;
  void _text;
}
