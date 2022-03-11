export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export const allocAndSet = (numBytes: number, initialValues: Array<number>) => {
  const buf = Buffer.alloc(numBytes);
  initialValues.forEach((value, i) => {
    buf[i] = value;
  });
  return buf;
};
