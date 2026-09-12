import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { interpolateAlong, lerpAngleDegrees, metersBetween, snapToPath, type Coord } from "../../geo/routePath";
import { colors, uiFont } from "../../theme";
import { SimulatedBadge } from "./SimulatedBadge";

const darkStyle = [
  { elementType: "geometry", stylers: [{ color: "#0b1120" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b9bb4" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1120" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];

function asCoord(c?: { latitude?: unknown; longitude?: unknown } | null): Coord | null {
  if (!c) return null;
  const latitude = Number(c.latitude);
  const longitude = Number(c.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  return { latitude, longitude };
}

const LOUISVILLE = { latitude: 38.2527, longitude: -85.7585 };

type Smooth = { latitude: number; longitude: number; heading: number };

export function LiveMap({
  bus,
  heading,
  path,
  progress,
  stops,
  myStopId,
  title,
  follow = false,
  height = 280,
  fill = false,
}: {
  bus?: Coord | null;
  heading?: number | null;
  path: Coord[];
  progress?: number | null;
  stops: { id: string; name: string; latitude: number; longitude: number }[];
  myStopId?: string;
  title?: string;
  follow?: boolean;
  height?: number;
  fill?: boolean;
}) {
  const [full, setFull] = useState(false);
  const safeBus = asCoord(bus);
  const safePath = path.map(asCoord).filter((c): c is Coord => !!c);
  const safeStops = stops.flatMap((s) => {
    const c = asCoord(s);
    return c ? [{ ...s, ...c }] : [];
  });
  const center = safeBus || safePath[0] || safeStops[0] || LOUISVILLE;

  const canvas = (
    <>
      <MapCanvas
        center={center}
        bus={safeBus}
        heading={heading}
        path={safePath}
        progress={progress}
        stops={safeStops}
        myStopId={myStopId}
        height={fill ? undefined : height}
        fill={fill}
        delta={follow ? 0.012 : 0.04}
        follow={follow}
        onToggle={() => setFull(true)}
        expanded={false}
      />
      <Modal visible={full} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setFull(false)}>
        <MapCanvas
          center={center}
          bus={safeBus}
          heading={heading}
          path={safePath}
          progress={progress}
          stops={safeStops}
          myStopId={myStopId}
          fill
          delta={0.01}
          follow
          title={title}
          onToggle={() => setFull(false)}
          expanded
        />
      </Modal>
    </>
  );
  return fill ? <View style={{ flex: 1 }}>{canvas}</View> : canvas;
}

function MapCanvas({
  center,
  bus,
  heading,
  path,
  progress,
  stops,
  myStopId,
  height,
  fill,
  delta,
  follow,
  title,
  onToggle,
  expanded,
}: {
  center: Coord;
  bus?: Coord | null;
  heading?: number | null;
  path: Coord[];
  progress?: number | null;
  stops: { id: string; name: string; latitude: number; longitude: number }[];
  myStopId?: string;
  height?: number;
  fill?: boolean;
  delta: number;
  follow?: boolean;
  title?: string;
  onToggle: () => void;
  expanded: boolean;
}) {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const followBus = asCoord(bus);
  const [smooth, setSmooth] = useState<Smooth | null>(null);

  const targetRef = useRef<{ latitude: number; longitude: number; heading: number; progress: number } | null>(null);
  const displayRef = useRef<Smooth & { progress: number } | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  const followRef = useRef(follow);
  followRef.current = follow;
  const lastPaint = useRef(0);

  useEffect(() => {
    if (!followBus) {
      targetRef.current = null;
      displayRef.current = null;
      setSmooth(null);
      return;
    }
    const route = pathRef.current;
    const snapped =
      route.length >= 2
        ? snapToPath(route, followBus.latitude, followBus.longitude)
        : { latitude: followBus.latitude, longitude: followBus.longitude, heading: heading || 0, progress: 0 };
    const nextProgress =
      typeof progress === "number" && Number.isFinite(progress) && progress > 0
        ? Math.min(1, progress)
        : snapped.progress;
    targetRef.current = {
      latitude: snapped.latitude,
      longitude: snapped.longitude,
      heading: heading || snapped.heading,
      progress: nextProgress,
    };
    if (!displayRef.current) {
      const placed = route.length >= 2 ? interpolateAlong(route, nextProgress) : snapped;
      displayRef.current = {
        latitude: placed.latitude,
        longitude: placed.longitude,
        heading: heading || placed.heading,
        progress: nextProgress,
      };
      setSmooth(displayRef.current);
    }
  }, [followBus?.latitude, followBus?.longitude, heading, progress]);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const target = targetRef.current;
      const display = displayRef.current;
      const route = pathRef.current;
      if (target && display) {
        const jump = metersBetween(display, target) > 420;
        if (jump) {
          display.latitude = target.latitude;
          display.longitude = target.longitude;
          display.heading = target.heading;
          display.progress = target.progress;
        } else if (route.length >= 2) {
          display.progress += (target.progress - display.progress) * 0.14;
          const placed = interpolateAlong(route, display.progress);
          display.latitude = placed.latitude;
          display.longitude = placed.longitude;
          display.heading = lerpAngleDegrees(display.heading, placed.heading, 0.2);
        } else {
          display.latitude += (target.latitude - display.latitude) * 0.12;
          display.longitude += (target.longitude - display.longitude) * 0.12;
          display.heading = lerpAngleDegrees(display.heading, target.heading, 0.14);
        }

        if (now - lastPaint.current >= 32) {
          lastPaint.current = now;
          setSmooth({ latitude: display.latitude, longitude: display.longitude, heading: display.heading });
          if (followRef.current) {
            mapRef.current?.setCamera({
              center: { latitude: display.latitude, longitude: display.longitude },
              heading: display.heading,
              pitch: 38,
              zoom: 16.2,
              altitude: 720,
            });
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (Platform.OS === "web") {
    return (
      <View style={{ height: height || 280, backgroundColor: colors.mapNight, justifyContent: "center", padding: 22 }}>
        <Text style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>
          Live map is available on iOS and Android. Open this screen on a device to follow the bus.
        </Text>
        <SimulatedBadge />
      </View>
    );
  }

  const pin = smooth || followBus;

  return (
    <View style={fill ? { flex: 1, backgroundColor: colors.mapNight } : { height: height || 280, backgroundColor: colors.mapNight }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={PROVIDER_DEFAULT}
        {...(Platform.OS === "android" ? { customMapStyle: darkStyle } : {})}
        initialRegion={{
          latitude: center.latitude,
          longitude: center.longitude,
          latitudeDelta: delta,
          longitudeDelta: delta,
        }}
        rotateEnabled={Boolean(follow)}
        pitchEnabled={Boolean(follow)}
        showsCompass={false}
        mapPadding={follow && fill ? { top: 72, right: 0, bottom: 210, left: 0 } : undefined}
      >
        {path.length > 1 ? <Polyline coordinates={path} strokeColor={colors.primary} strokeWidth={4} /> : null}
        {stops.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.latitude, longitude: s.longitude }}
            title={s.name}
            pinColor={s.id === myStopId ? colors.warn : "#64748B"}
            tracksViewChanges={false}
          />
        ))}
        {pin ? (
          <Marker
            coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
            title="Bus"
            rotation={smooth?.heading ?? heading ?? 0}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            tracksViewChanges={false}
          >
            <View
              style={{
                width: expanded ? 22 : 18,
                height: expanded ? 22 : 18,
                borderRadius: 6,
                backgroundColor: colors.primary,
                borderWidth: 2,
                borderColor: colors.white,
              }}
            />
          </Marker>
        ) : null}
      </MapView>

      <Pressable
        accessibilityLabel={expanded ? "Exit full screen" : "Full screen map"}
        onPress={onToggle}
        style={{
          position: "absolute",
          top: (expanded ? insets.top : 0) + 12,
          right: 14,
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#101828",
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Ionicons name={expanded ? "contract-outline" : "expand-outline"} size={18} color={colors.ink} />
      </Pressable>

      {expanded && title ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: insets.top + 12,
            left: 14,
            right: 62,
            backgroundColor: "rgba(255,255,255,.92)",
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
          }}
        >
          <Text style={{ ...uiFont, fontSize: 14, fontWeight: "600", color: colors.ink }} numberOfLines={1}>
            {title}
          </Text>
        </View>
      ) : null}

      <SimulatedBadge />
    </View>
  );
}
