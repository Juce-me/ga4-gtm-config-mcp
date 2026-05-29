export function propertyName(propertyIdOrName: string): string {
  const parts = propertyIdOrName.split("/");
  const index = parts.lastIndexOf("properties");
  return `properties/${index >= 0 ? parts[index + 1] ?? propertyIdOrName : propertyIdOrName}`;
}

export function dataStreamName(propertyIdOrName: string, streamIdOrName: string): string {
  if (streamIdOrName.includes("/dataStreams/")) {
    return streamIdOrName;
  }
  return `${propertyName(propertyIdOrName)}/dataStreams/${streamIdOrName}`;
}
