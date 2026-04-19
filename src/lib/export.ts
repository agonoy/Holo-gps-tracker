import { PathPoint } from '../types';

export function exportToGPX(trail: PathPoint[], name: string): string {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Holoholo GPS Tracker" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>`;
  
  const footer = `    </trkseg>
  </trk>
</gpx>`;

  const points = trail.map(p => `      <trkpt lat="${p.lat}" lon="${p.lng}">
        <time>${new Date(p.timestamp).toISOString()}</time>
      </trkpt>`).join('\n');

  return header + '\n' + points + '\n' + footer;
}

export function exportToKML(trail: PathPoint[], name: string): string {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <Placemark>
      <name>${name}</name>
      <LineString>
        <coordinates>`;
  
  const footer = `        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  const coordinates = trail.map(p => `${p.lng},${p.lat},0`).join(' ');

  return header + '\n' + coordinates + '\n' + footer;
}

export function downloadFile(content: string, filename: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
