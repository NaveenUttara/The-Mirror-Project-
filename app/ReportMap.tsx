'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, CircleMarker as LeafletCircleMarker } from 'leaflet';

export type MapMarker = {
    id: string;
    latitude: number;
    longitude: number;
    color?: string;
    label?: string;
};

type ReportMapProps = {
    markers: MapMarker[];
    className?: string;
    emptyLabel?: string;
    height?: number;
    zoom?: number;
};

const DEFAULT_CENTER: [number, number] = [12.9716, 77.5946];

function mapsUrl(latitude: number, longitude: number) {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export function googleMapsUrl(latitude: number, longitude: number) {
    return mapsUrl(latitude, longitude);
}

export default function ReportMap({
    markers,
    className = 'geo-map',
    emptyLabel,
    height = 320,
    zoom,
}: ReportMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<LeafletMap | null>(null);
    const markerLayerRef = useRef<LeafletCircleMarker[]>([]);

    useEffect(() => {
        let cancelled = false;

        void import('leaflet').then((leafletModule) => {
            if (cancelled || !containerRef.current || mapRef.current) {
                return;
            }

            const L = leafletModule.default;
            const map = L.map(containerRef.current, {
                zoomControl: true,
                attributionControl: true,
            });
            mapRef.current = map;

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            }).addTo(map);
        });

        return () => {
            cancelled = true;
            markerLayerRef.current = [];
            mapRef.current?.remove();
            mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        void import('leaflet').then((leafletModule) => {
            const map = mapRef.current;
            if (!map) {
                return;
            }

            const L = leafletModule.default;
            markerLayerRef.current.forEach((marker) => marker.remove());
            markerLayerRef.current = [];

            if (markers.length === 0) {
                map.setView(DEFAULT_CENTER, 11);
                return;
            }

            markers.forEach((point) => {
                const marker = L.circleMarker([point.latitude, point.longitude], {
                    radius: 9,
                    color: '#ffffff',
                    weight: 2,
                    fillColor: point.color || '#d94841',
                    fillOpacity: 0.95,
                }).addTo(map);

                if (point.label) {
                    marker.bindPopup(
                        `<strong>${point.label}</strong><br />${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}<br /><a href="${mapsUrl(point.latitude, point.longitude)}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>`,
                    );
                }

                markerLayerRef.current.push(marker);
            });

            if (markers.length === 1) {
                map.setView([markers[0].latitude, markers[0].longitude], zoom ?? 17);
                return;
            }

            const bounds = L.latLngBounds(markers.map((point) => [point.latitude, point.longitude] as [number, number]));
            map.fitBounds(bounds.pad(0.2));
        });
    }, [markers, zoom]);

    if (markers.length === 0 && emptyLabel) {
        return (
            <div className={`${className} geo-map-empty`} style={{ height }}>
                <p>{emptyLabel}</p>
            </div>
        );
    }

    return <div ref={containerRef} className={className} style={{ height }} aria-label="Map of reported pothole locations" />;
}
