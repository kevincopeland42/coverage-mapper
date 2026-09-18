import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabase'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'

interface LocationData {
  latitude: number | null
  longitude: number | null
  accuracy: number | null
}

interface PingResult {
  id?: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  latency_ms: number | null
  status: 'OK' | 'HIGH' | 'TIMEOUT'
  connection_type: string | null
  device_os: string | null
  carrier: string
  device_model: string
  created_at?: string
  session_id?: string
  app_version?: string
  test_endpoint?: string
  browser_platform?: string
  reported_os?: string
}

// Create custom icons for map markers
const createMarkerIcon = (status: string, latency_ms: number | null) => {
  let color = '#4CAF50' // OK - Green (<=500ms)
  if (status === 'HIGH' || (latency_ms && latency_ms > 500)) color = '#FFA500' // Yellow (>500ms)
  if (status === 'TIMEOUT') color = '#f44336' // Red (TIMEOUT / Failed)

  return L.divIcon({
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.3);"></div>`,
    iconSize: [16, 16],
    className: 'custom-marker',
  })
}

// Type for map bounds
interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

// MapRecenter component - handles auto-fit bounds and recenter logic
interface MapRecenterProps {
  mapPings: PingResult[]
  location: LocationData
}

const MapRecenter = ({ mapPings, location }: MapRecenterProps) => {
  const map = useMap()
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (!map || hasInitializedRef.current) return

    // Only auto-fit bounds on initial load when data first arrives
    if (mapPings.length > 0) {
      const validPings = mapPings.filter(
        (ping) => ping.latitude !== null && ping.longitude !== null
      )

      if (validPings.length > 0) {
        hasInitializedRef.current = true

        if (validPings.length === 1) {
          // Single pin - center on it with zoom 15
          const ping = validPings[0]
          map.flyTo([ping.latitude!, ping.longitude!], 15, { duration: 1 })
        } else if (validPings.length > 1) {
          // Multiple pins - fit bounds around all of them
          const bounds = L.latLngBounds(
            validPings.map((ping) => [ping.latitude!, ping.longitude!])
          )
          map.fitBounds(bounds, { padding: [50, 50], duration: 1 })
        }
      }
    } else if (location.latitude && location.longitude) {
      // No pins - center on current GPS position
      hasInitializedRef.current = true
      map.flyTo([location.latitude, location.longitude], 15, { duration: 1 })
    }
  }, [])

  return null
}

// RecenterButton component - floating button to snap back to latest ping
interface RecenterButtonProps {
  mapPings: PingResult[]
  location: LocationData
  containerRef?: React.RefObject<HTMLDivElement | null>
  isFollowing: boolean
  setIsFollowing: (value: boolean) => void
}

const RecenterButton = ({ mapPings, location, containerRef, isFollowing, setIsFollowing }: RecenterButtonProps) => {
  const map = useMap()
  const followingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start or stop following mode
  useEffect(() => {
    if (isFollowing && map) {
      // Start following the latest ping
      followingIntervalRef.current = setInterval(() => {
        if (mapPings.length > 0) {
          const latestPing = mapPings[mapPings.length - 1]
          if (latestPing.latitude && latestPing.longitude) {
            const currentCenter = map.getCenter()
            // Only fly to if we've moved significantly
            const distance = currentCenter.distanceTo([latestPing.latitude, latestPing.longitude])
            if (distance > 50) { // 50 meters threshold
              map.flyTo([latestPing.latitude, latestPing.longitude], 15, { duration: 0.3, noMoveStart: true })
            }
          }
        }
      }, 1000)
    } else {
      // Stop following
      if (followingIntervalRef.current) {
        clearInterval(followingIntervalRef.current)
        followingIntervalRef.current = null
      }
    }

    return () => {
      if (followingIntervalRef.current) {
        clearInterval(followingIntervalRef.current)
      }
    }
  }, [isFollowing, mapPings, map])

  // Stop following when user manually interacts with map
  useEffect(() => {
    if (!map) return

    const handleMapMove = () => {
      if (isFollowing) {
        setIsFollowing(false)
      }
    }

    const handleMapZoom = () => {
      if (isFollowing) {
        setIsFollowing(false)
      }
    }

    map.on('move', handleMapMove)
    map.on('zoom', handleMapZoom)

    return () => {
      map.off('move', handleMapMove)
      map.off('zoom', handleMapZoom)
    }
  }, [map, isFollowing, setIsFollowing])

  const handleRecenter = () => {
    if (!map) return

    // Toggle following mode or snap to location
    if (isFollowing) {
      // Already following, click again to stop
      setIsFollowing(false)
    } else {
      // Not following, enable it
      setIsFollowing(true)

      // Initial snap to latest ping or current location
      if (mapPings.length > 0) {
        const latestPing = mapPings[mapPings.length - 1]
        if (latestPing.latitude && latestPing.longitude) {
          map.flyTo([latestPing.latitude, latestPing.longitude], 15, { duration: 0.5 })
        }
      } else if (location.latitude && location.longitude) {
        map.flyTo([location.latitude, location.longitude], 15, { duration: 0.5 })
      }
    }
  }

  const buttonElement = (
    <button
      onClick={handleRecenter}
      style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        zIndex: 500,
        padding: '12px 16px',
        backgroundColor: isFollowing ? '#ff9800' : '#2196F3',
        color: 'white',
        border: 'none',
        borderRadius: '50px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 'bold',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLButtonElement).style.transform = 'scale(1.05)'
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLButtonElement).style.transform = 'scale(1)'
      }}
      title={isFollowing ? 'Stop following - Click to stop or manually move map' : 'Start following - Map will follow your marker'}
    >
      {isFollowing ? '🎯 Following' : '📍 Recenter'}
    </button>
  )

  // If containerRef is provided, use Portal to render outside the map
  if (containerRef && containerRef.current) {
    return createPortal(buttonElement, containerRef.current)
  }

  // Fallback - return null if no container provided
  return null
}

// MapBoundsTracker component - tracks visible map bounds for stats filtering
interface MapBoundsTrackerProps {
  onBoundsChange: (bounds: MapBounds | null) => void
}

const MapBoundsTracker = ({ onBoundsChange }: MapBoundsTrackerProps) => {
  const map = useMap()
  const lastBoundsRef = useRef<MapBounds | null>(null)

  useEffect(() => {
    if (!map) return

    const handleMoveOrZoom = () => {
      const bounds = map.getBounds()
      const newBounds: MapBounds = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      }

      // Only notify if bounds actually changed
      if (!lastBoundsRef.current || 
          lastBoundsRef.current.north !== newBounds.north ||
          lastBoundsRef.current.south !== newBounds.south ||
          lastBoundsRef.current.east !== newBounds.east ||
          lastBoundsRef.current.west !== newBounds.west) {
        lastBoundsRef.current = newBounds
        onBoundsChange(newBounds)
      }
    }

    // Listen to map pan and zoom events
    map.on('moveend', handleMoveOrZoom)
    map.on('zoomend', handleMoveOrZoom)
    
    // Get initial bounds
    handleMoveOrZoom()

    return () => {
      map.off('moveend', handleMoveOrZoom)
      map.off('zoomend', handleMoveOrZoom)
    }
  }, [map, onBoundsChange])

  return null
}

// Carrier selection
const CARRIERS = ['AT&T', 'Verizon', 'T-Mobile', 'UScellular', 'Other'] as const
type Carrier = typeof CARRIERS[number]

const normalizeCarrier = (value: unknown): Carrier => {
  if (!value) return 'Other'
  
  const carrier = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.&]/g, '')
    .replace(/&amp;/g, '')
  
  if (carrier.includes('at&t') || carrier === 'att' || carrier === 'andt') return 'AT&T'
  if (carrier.includes('verizon')) return 'Verizon'
  if (carrier.includes('tmobile') || carrier.includes('t-mobile')) return 'T-Mobile'
  if (carrier.includes('uscellular') || carrier.includes('uscell')) return 'UScellular'
  if (carrier.includes('unknown')) return 'Other'
  
  return 'Other'
}

// App version
const APP_VERSION = '1.0.0'

// Generate or retrieve session ID (randomized contributor ID)
const getOrCreateSessionId = (): string => {
  const SESSION_ID_KEY = 'coverage_mapper_session_id'
  try {
    let sessionId = localStorage.getItem(SESSION_ID_KEY)
    if (!sessionId) {
      // Generate a new session ID: random hex string
      sessionId = 'session_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
      localStorage.setItem(SESSION_ID_KEY, sessionId)
    }
    return sessionId
  } catch {
    return 'session_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
  }
}

// Get browser platform (WebKit, Gecko, Blink)
const getBrowserPlatform = (): string => {
  const userAgent = navigator.userAgent
  if (/WebKit/.test(userAgent)) return 'WebKit'
  if (/Gecko/.test(userAgent)) return 'Gecko'
  if (/Blink/.test(userAgent)) return 'Blink'
  if (/Trident/.test(userAgent)) return 'Trident'
  return 'Unknown'
}

// Get detailed device info
interface DeviceInfo {
  model: string
  reportedOS: string
  browserPlatform: string
}

const getDetailedDeviceInfo = (): DeviceInfo => {
  const userAgent = navigator.userAgent
  let model = 'Unknown'
  let reportedOS = 'Unknown'
  const browserPlatform = getBrowserPlatform()

  // Check for iPhone/iPad FIRST (before Mac check!)
  if (/iPhone/.test(userAgent)) {
    model = 'iPhone'
    reportedOS = 'iOS'
    const version = /iPhone OS (\d+)/.exec(userAgent)?.[1]
    if (version) reportedOS = `iOS ${version}`
  } else if (/iPad/.test(userAgent)) {
    model = 'iPad'
    reportedOS = 'iOS'
    const version = /OS (\d+)/.exec(userAgent)?.[1]
    if (version) reportedOS = `iOS ${version}`
  }
  // Android detection
  else if (/Android/.test(userAgent)) {
    model = 'Android Device'
    const match = userAgent.match(/Android\s([\d.]+)/)
    reportedOS = match ? `Android ${match[1]}` : 'Android'
  }
  // Windows
  else if (/Windows/.test(userAgent)) {
    model = 'Windows PC'
    reportedOS = 'Windows'
  }
  // macOS (check AFTER iPhone/iPad!)
  else if (/Mac/.test(userAgent) && !/iPhone/.test(userAgent) && !/iPad/.test(userAgent)) {
    model = 'Mac'
    reportedOS = 'macOS'
  }
  // Linux
  else if (/Linux/.test(userAgent)) {
    model = 'Linux Device'
    reportedOS = 'Linux'
  }
  // Browser-only detection
  else if (/Chrome/.test(userAgent)) {
    model = 'Chrome Browser'
  } else if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) {
    model = 'Safari Browser'
  } else if (/Firefox/.test(userAgent)) {
    model = 'Firefox Browser'
  }

  return { model, reportedOS, browserPlatform }
}

// Get device model from userAgent (backward compatible wrapper)
const getDeviceModel = (): string => {
  return getDetailedDeviceInfo().model
}

// Offline queue management
const OFFLINE_QUEUE_KEY = 'offline_pings'
const ACTIVE_CARRIER_KEY = 'active_carrier'

const getOfflineQueue = (): PingResult[] => {
  try {
    const queued = localStorage.getItem(OFFLINE_QUEUE_KEY)
    return queued ? JSON.parse(queued) : []
  } catch {
    return []
  }
}

const addToOfflineQueue = (ping: PingResult) => {
  try {
    const queue = getOfflineQueue()
    queue.push(ping)
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
  } catch (error) {
    console.error('Failed to add to offline queue:', error)
  }
}

const clearOfflineQueue = () => {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY)
  } catch (error) {
    console.error('Failed to clear offline queue:', error)
  }
}

const flushOfflineQueue = async (supabaseInsert: (data: any[]) => Promise<{ error: any; data: any }>) => {
  const queue = getOfflineQueue()
  if (queue.length === 0) {
    console.log('No offline pings to sync')
    return true
  }

  if (!navigator.onLine) {
    console.warn('Still offline: Cannot flush queue yet')
    return false
  }

  console.log(`🔄 Syncing ${queue.length} offline ping(s) to Supabase...`)
  
  // Process queue in chunks of 50 to avoid timeout/limit issues
  const BATCH_SIZE = 50
  const successfulIndices = new Set<number>()
  const totalBatches = Math.ceil(queue.length / BATCH_SIZE)

  try {
    for (let i = 0; i < queue.length; i += BATCH_SIZE) {
      const batch = queue.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      
      console.log(`🔄 Batch ${batchNum}/${totalBatches}: Syncing ${batch.length} pings...`)
      
      const { error, data } = await supabaseInsert(batch)
      
      if (!error) {
        console.log(`✅ Batch ${batchNum} synced successfully (${data?.length || batch.length} rows)`)
        // Track indices of successfully synced items
        for (let j = 0; j < batch.length; j++) {
          successfulIndices.add(i + j)
        }
      } else {
        console.error(`❌ Batch ${batchNum} failed:`, { code: error.code, message: error.message })
      }
    }

    const successCount = successfulIndices.size
    const failureCount = queue.length - successCount

    if (successCount === queue.length) {
      console.log(`✅ Successfully synced all ${successCount} offline ping(s) to Supabase`)
      clearOfflineQueue()
      return true
    } else if (successCount > 0) {
      console.warn(`⚠️ Partial sync: ${successCount} succeeded, ${failureCount} failed`)
      // Build new queue with only failed items
      const remainingQueue = queue.filter((_, idx) => !successfulIndices.has(idx))
      try {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue))
      } catch (e) {
        console.error('Failed to update queue after partial sync:', e)
      }
      return false
    } else {
      console.error(`❌ All ${failureCount} pings failed to sync`)
      return false
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('❌ Exception syncing offline queue:', errorMsg)
    return false
  }
}

function App() {
  const [location, setLocation] = useState<LocationData>({
    latitude: null,
    longitude: null,
    accuracy: null,
  })
  const [isTracking, setIsTracking] = useState(false)
  const [isPocketMode, setIsPocketMode] = useState(false)
  const [pocketModeUnlocked, setPocketModeUnlocked] = useState(false)
  const [pocketSlidePosition, setPocketSlidePosition] = useState(0)
  const [currentView, setCurrentView] = useState<'tracker' | 'map'>('tracker')
  const [mapPings, setMapPings] = useState<PingResult[]>([])
  const [activeCarrier, setActiveCarrier] = useState<Carrier>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_CARRIER_KEY)
      return (saved as Carrier) || 'Other'
    } catch {
      return 'Other'
    }
  })
  const [selectedCarrierFilters, setSelectedCarrierFilters] = useState<Set<Carrier>>(new Set()) // Start with all carriers deselected
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<Set<'HIGH' | 'TIMEOUT'>>(new Set())
  const [offlineQueueSize, setOfflineQueueSize] = useState(0) // Track offline queue size for UI
  const [isMapFollowing, setIsMapFollowing] = useState(false) // Track if map is in following mode
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null) // Track visible map bounds for stats filtering
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const touchStartRef = useRef(0)
  const latestCoordsRef = useRef<LocationData>(location) // Cache latest GPS coordinates
  const mapContainerRef = useRef<HTMLDivElement>(null) // Reference for map wrapper
  const deviceModelRef = useRef<string>(getDeviceModel()) // Cache device model
  const deviceInfoRef = useRef<DeviceInfo>(getDetailedDeviceInfo()) // Cache detailed device info
  const sessionIdRef = useRef<string>(getOrCreateSessionId()) // Cache session ID

  // Get device OS (legacy function for backward compatibility)
  const getDeviceOS = (): string => {
    return getDetailedDeviceInfo().reportedOS
  }

  // Get connection type
  const getConnectionType = (): string | null => {
    const nav = navigator as any
    const connection =
      nav.connection ||
      nav.mozConnection ||
      nav.webkitConnection
    return connection?.effectiveType || null
  }

  // Fetch fresh GPS coordinates for current ping
  const getFreshGPSCoordinates = (): Promise<LocationData> => {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        // Geolocation not available, use last known position
        console.warn('Geolocation not available, using last known position')
        resolve(latestCoordsRef.current)
        return
      }

      const gpsTimeout = setTimeout(() => {
        // GPS timeout - use last known position with degraded accuracy
        console.warn('GPS timeout during ping, using last known position')
        const fallbackLocation = { ...latestCoordsRef.current }
        if (fallbackLocation.accuracy !== null) {
          fallbackLocation.accuracy = fallbackLocation.accuracy + 1000 // Mark as degraded
        }
        resolve(fallbackLocation)
      }, 5000)

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(gpsTimeout)
          const freshLocation: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          }
          latestCoordsRef.current = freshLocation // Update cache
          setLocation(freshLocation) // Update state for UI
          resolve(freshLocation)
        },
        (error) => {
          clearTimeout(gpsTimeout)
          // GPS error - use last known position
          console.warn('GPS error during ping:', error.message)
          resolve(latestCoordsRef.current)
        },
        {
          enableHighAccuracy: true, // Use GPS if available
          timeout: 5000,
          maximumAge: 0, // Force fresh position, don't use cache
        }
      )
    })
  }

  // Perform a ping and measure latency
  const performPing = async (url: string = '/') => {
    try {
      const start = performance.now()
      const response = await Promise.race([
        fetch(url, { method: 'HEAD', cache: 'no-cache' }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 10000)
        ),
      ])
      const end = performance.now()
      const latency = end - start

      if (response instanceof Response) {
        if (response.ok) {
          return {
            latency_ms: Math.round(latency),
            status: latency > 500 ? ('HIGH' as const) : ('OK' as const),
          }
        }
        // Non-200 response is treated as TIMEOUT/FAILED
        console.warn(`Ping failed: HTTP ${response.status}`)
        return {
          latency_ms: null,
          status: 'TIMEOUT' as const,
        }
      }

      // Response is not a Response object (unexpected)
      console.warn('Ping failed: unexpected response type')
      return {
        latency_ms: null,
        status: 'TIMEOUT' as const,
      }
    } catch (error) {
      // Catch all errors: TIMEOUT, network errors, CORS, etc.
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`Ping error: ${errorMsg}`)
      return {
        latency_ms: null,
        status: 'TIMEOUT' as const,
      }
    }
  }

  // Record ping to Supabase
  const recordPingToSupabase = async (pingData: PingResult) => {
    // Check if online first
    if (!navigator.onLine) {
      console.warn('🔴 Device offline (navigator.onLine=false): Queueing ping to localStorage')
      addToOfflineQueue(pingData)
      return false
    }

    try {
      console.log('📤 Attempting Supabase insert for ping:', { carrier: pingData.carrier, status: pingData.status, lat: pingData.latitude, lng: pingData.longitude })
      
      // Use .select() to force return of inserted data
      const { error, data, status } = await supabase.from('pings').insert([pingData]).select()

      console.log('📊 Supabase response:', { status, hasError: !!error, hasData: !!data, errorCode: error?.code, errorMessage: error?.message })

      if (error) {
        console.error('❌ Supabase insert failed:', { code: error.code, message: error.message, details: error })
        console.warn('📥 Queueing ping to localStorage due to Supabase error')
        addToOfflineQueue(pingData)
        return false
      }

      if (data && data.length > 0) {
        console.log('✅ Ping successfully inserted to Supabase, ID:', data[0].id)
        return true
      } else {
        console.warn('⚠️ Insert returned no data - treating as success anyway')
        return true
      }
    } catch (err) {
      // Network or other exception during Supabase call
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('❌ Exception during Supabase insert:', errorMsg, err)
      console.warn('📥 Queueing ping to localStorage due to exception')
      addToOfflineQueue(pingData)
      return false
    }
  }

  // Request wake lock
  const requestWakeLock = async () => {
    try {
      const nav = navigator as any
      if ('wakeLock' in nav) {
        wakeLockRef.current = await nav.wakeLock.request('screen')
        console.log('Wake lock acquired')
      }
    } catch (err) {
      console.error('Wake lock request failed:', err)
    }
  }

  // Release wake lock
  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release()
        wakeLockRef.current = null
        console.log('Wake lock released')
      } catch (err) {
        console.error('Wake lock release failed:', err)
      }
    }
  }

  // Handle ping and add to history
  const handleAutoPing = useCallback(async () => {
    try {
      // Fetch fresh GPS coordinates before ping
      const freshLocation = await getFreshGPSCoordinates()

      // Perform ping and measure latency
      const pingResult = await performPing('/')
      const connectionType = getConnectionType()
      const deviceInfo = deviceInfoRef.current

      // Use fresh GPS coordinates for this ping
      const pingData: PingResult = {
        latitude: freshLocation.latitude,
        longitude: freshLocation.longitude,
        accuracy: freshLocation.accuracy,
        latency_ms: pingResult.latency_ms,
        status: pingResult.status,
        connection_type: connectionType,
        device_os: deviceInfo.reportedOS,
        carrier: normalizeCarrier(activeCarrier),
        device_model: deviceInfo.model,
        session_id: sessionIdRef.current,
        app_version: APP_VERSION,
        test_endpoint: '/',
        browser_platform: deviceInfo.browserPlatform,
        reported_os: deviceInfo.reportedOS,
      }

      // Always add ping to map state for immediate display (even if offline/failed)
      const newMapPing: PingResult = {
        ...pingData,
        created_at: new Date().toISOString(),
      }
      setMapPings((prev) => [...prev, newMapPing])

      // Log ping result with status
      const statusEmoji = 
        pingResult.status === 'OK' ? '✅' :
        pingResult.status === 'HIGH' ? '⚠️' :
        '❌'
      console.log(
        `${statusEmoji} Ping [${pingResult.status}] - Latency: ${pingResult.latency_ms ?? 'N/A'}ms, ` +
        `Location: [${freshLocation.latitude?.toFixed(4)}, ${freshLocation.longitude?.toFixed(4)}], ` +
        `Online: ${navigator.onLine}`
      )

      // Try to record to Supabase (will queue offline if needed)
      const recordedToSupabase = await recordPingToSupabase(pingData)
      
      if (!recordedToSupabase && pingResult.status === 'TIMEOUT') {
        const queueSize = getOfflineQueue().length
        console.warn(`⏳ TIMEOUT ping queued offline (queue size: ${queueSize})`)
        setOfflineQueueSize(queueSize)
      }

      // If this was a successful Supabase record and we were offline, try to flush remaining queue
      if (recordedToSupabase && getOfflineQueue().length > 0) {
        console.log('🔄 Successful ping detected after offline period - syncing queue...')
        setTimeout(async () => {
          const success = await flushOfflineQueue(async (data) => {
            return supabase.from('pings').insert(data)
          })
          if (success) {
            console.log('✅ Offline queue cleared successfully')
            setOfflineQueueSize(0)
          } else {
            const queueSize = getOfflineQueue().length
            setOfflineQueueSize(queueSize)
          }
        }, 500)
      } else if (recordedToSupabase) {
        // Successfully recorded and no queue left
        setOfflineQueueSize(0)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('❌ Auto ping error:', errorMsg)
    }
  }, [activeCarrier])

  // Initialize background geolocation watcher for UI updates
  useEffect(() => {
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const newLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          }
          setLocation(newLocation)
          latestCoordsRef.current = newLocation // Cache the latest coordinates
        },
        (error) => {
          console.error('Geolocation watcher error:', error)
        },
        {
          enableHighAccuracy: true, // Use GPS if available
          timeout: 10000,
          maximumAge: 0,
        }
      )
      return () => {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [])

  // Fetch existing pings from Supabase
  const fetchMapPings = async () => {
    try {
      let allData: any[] = []
      let hasMore = true
      let offset = 0
      const pageSize = 1000

      // Fetch all records using pagination
      while (hasMore) {
        const { data, error } = await supabase
          .from('pings')
          .select('*')
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1)

        if (error) {
          console.error('Error fetching pings:', error)
          return
        }

        if (data && data.length > 0) {
          allData = allData.concat(data)
          offset += pageSize
          hasMore = data.length === pageSize
        } else {
          hasMore = false
        }
      }

      if (allData.length > 0) {
        setMapPings(
          allData.map((ping: any) => ({
            id: ping.id,
            latitude: ping.latitude,
            longitude: ping.longitude,
            accuracy: ping.accuracy,
            latency_ms: ping.latency_ms,
            status: ping.status,
            connection_type: ping.connection_type,
            device_os: ping.device_os,
            carrier: normalizeCarrier(ping.carrier),
            device_model: ping.device_model || 'Unknown',
            created_at: ping.created_at,
            session_id: ping.session_id,
            app_version: ping.app_version,
            test_endpoint: ping.test_endpoint,
            browser_platform: ping.browser_platform,
            reported_os: ping.reported_os,
          }))
        )
      }
    } catch (err) {
      console.error('Exception fetching pings:', err)
    }
  }

  // Subscribe to real-time updates
  useEffect(() => {
    fetchMapPings()

    // Use the modern Supabase real-time API with channels
    const channel = supabase.channel('pings-updates').on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'pings',
      },
      (payload: any) => {
        const newPing: PingResult = {
          id: payload.new.id,
          latitude: payload.new.latitude,
          longitude: payload.new.longitude,
          accuracy: payload.new.accuracy,
          latency_ms: payload.new.latency_ms,
          status: payload.new.status,
          connection_type: payload.new.connection_type,
          device_os: payload.new.device_os,
          carrier: normalizeCarrier(payload.new.carrier),
          device_model: payload.new.device_model || 'Unknown',
          created_at: payload.new.created_at,
          session_id: payload.new.session_id,
          app_version: payload.new.app_version,
          test_endpoint: payload.new.test_endpoint,
          browser_platform: payload.new.browser_platform,
          reported_os: payload.new.reported_os,
        }
        setMapPings((prev) => [newPing, ...prev])
      }
    )

    channel.subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [])

  // Handle online/offline events and flush offline queue
  useEffect(() => {
    const handleOnline = async () => {
      console.log('📡 Connection restored! Attempting to sync offline pings...')
      // Wait a moment for connection to stabilize
      setTimeout(async () => {
        const success = await flushOfflineQueue(async (data) => {
          return supabase.from('pings').insert(data)
        })
        if (success) {
          console.log('✅ Offline queue cleared successfully')
          setOfflineQueueSize(0)
        } else {
          // Update UI with current queue size
          const queueSize = getOfflineQueue().length
          setOfflineQueueSize(queueSize)
        }
      }, 1000)
    }

    const handleOffline = () => {
      console.log('📵 Connection lost - pings will be queued offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Attempt to flush queue on component mount if online
    if (navigator.onLine) {
      setTimeout(async () => {
        const success = await flushOfflineQueue(async (data) => {
          return supabase.from('pings').insert(data)
        })
        if (success) {
          setOfflineQueueSize(0)
        } else {
          const queueSize = getOfflineQueue().length
          setOfflineQueueSize(queueSize)
        }
      }, 2000)
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Monitor offline queue size for UI updates
  useEffect(() => {
    const updateQueueSize = () => {
      setOfflineQueueSize(getOfflineQueue().length)
    }

    // Update queue size on initial load
    updateQueueSize()

    // Monitor queue size every 2 seconds
    const intervalId = setInterval(updateQueueSize, 2000)

    return () => clearInterval(intervalId)
  }, [])

  // Update cached coordinates when location state changes
  useEffect(() => {
    latestCoordsRef.current = location
  }, [location])

  // Persist active carrier selection
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_CARRIER_KEY, activeCarrier)
    } catch (error) {
      console.error('Failed to persist carrier selection:', error)
    }
  }, [activeCarrier])

  // Handle tracking toggle
  const handleToggleTracking = async () => {
    if (!isTracking) {
      // Start tracking
      setIsTracking(true)
      await requestWakeLock()

      // Perform initial ping immediately
      await handleAutoPing()

      // Set up interval for pings every 3 seconds
      intervalRef.current = setInterval(() => {
        handleAutoPing()
      }, 3000)
    } else {
      // Stop tracking
      setIsTracking(false)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      await releaseWakeLock()
    }
  }

  // Manage interval lifecycle - ensure it keeps running even if component re-renders
  useEffect(() => {
    if (!isTracking) {
      // Not tracking - clear any intervals
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isTracking])

  // Handle pocket mode unlock slider
  const handlePocketSlideStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientY
  }

  const handlePocketSlideMove = (e: React.TouchEvent) => {
    if (!isPocketMode) return
    const currentY = e.touches[0].clientY
    const diff = touchStartRef.current - currentY
    const maxSlide = 100
    const position = Math.min(Math.max(diff, 0), maxSlide)
    setPocketSlidePosition(position)

    if (position >= maxSlide) {
      setPocketModeUnlocked(true)
      setPocketSlidePosition(0)
    }
  }

  const handlePocketSlideEnd = () => {
    if (!pocketModeUnlocked) {
      setPocketSlidePosition(0)
    }
  }

  // Exit pocket mode
  const handleExitPocketMode = () => {
    setIsPocketMode(false)
    setPocketModeUnlocked(false)
    setPocketSlidePosition(0)
  }

  // Calculate ping statistics and experience score
  const pingStats = useMemo(() => {
    // Start with all pings
    let pingsToAnalyze = mapPings

    // If map bounds are set, filter to only pings within bounds
    if (mapBounds) {
      pingsToAnalyze = mapPings.filter((ping) => {
        if (ping.latitude === null || ping.longitude === null) return false
        return (
          ping.latitude >= mapBounds.south &&
          ping.latitude <= mapBounds.north &&
          ping.longitude >= mapBounds.west &&
          ping.longitude <= mapBounds.east
        )
      })
    }

    // Skip stats if no carrier filters selected
    if (selectedCarrierFilters.size === 0) {
      return {
        totalPings: 0,
        okCount: 0,
        highLatencyCount: 0,
        timedOutCount: 0,
        okPercentage: 0,
        highLatencyPercentage: 0,
        timedOutPercentage: 0,
        experienceScore: 100,
        isFiltered: mapBounds !== null,
      }
    }

    // Then filter based on carrier and status selections
    const filteredByCarrier = pingsToAnalyze.filter((ping) => {
      // Check carrier filter
      const normalizedCarrier = normalizeCarrier(ping.carrier)
      if (!selectedCarrierFilters.has(normalizedCarrier)) {
        return false
      }
      // Check status filter - if no filters selected, show all
      if (selectedStatusFilters.size > 0) {
        if (!selectedStatusFilters.has(ping.status as 'HIGH' | 'TIMEOUT')) {
          return false
        }
      }
      return true
    })

    if (filteredByCarrier.length === 0) {
      return {
        totalPings: 0,
        okCount: 0,
        highLatencyCount: 0,
        timedOutCount: 0,
        okPercentage: 0,
        highLatencyPercentage: 0,
        timedOutPercentage: 0,
        experienceScore: 100,
        isFiltered: mapBounds !== null,
      }
    }

    const okCount = filteredByCarrier.filter(p => p.status === 'OK').length
    const highLatencyCount = filteredByCarrier.filter(p => p.status === 'HIGH').length
    const timedOutCount = filteredByCarrier.filter(p => p.status === 'TIMEOUT').length
    const totalPings = filteredByCarrier.length

    const okPercentage = Math.round((okCount / totalPings) * 100)
    const highLatencyPercentage = Math.round((highLatencyCount / totalPings) * 100)
    const timedOutPercentage = Math.round((timedOutCount / totalPings) * 100)

    // Experience score: 100 if perfect, decreases based on issues
    // High latency reduces score by half the percentage
    // Timeouts reduce score by full percentage
    const experienceScore = Math.max(
      0,
      100 - (highLatencyPercentage * 0.5 + timedOutPercentage)
    )

    return {
      totalPings,
      okCount,
      highLatencyCount,
      timedOutCount,
      okPercentage,
      highLatencyPercentage,
      timedOutPercentage,
      experienceScore: Math.round(experienceScore * 10) / 10,
      isFiltered: mapBounds !== null,
    }
  }, [mapPings, selectedCarrierFilters, selectedStatusFilters, mapBounds])

  // Map center calculation - default to user location if available, else a fallback center
  const mapCenter = useMemo(() => {
    if (mapPings.length > 0 && mapPings[0].latitude && mapPings[0].longitude) {
      return [mapPings[0].latitude, mapPings[0].longitude] as [number, number]
    }
    // Fallback to Maine center (near tracking area)
    return [45.2538, -69.4455] as [number, number]
  }, [mapPings])

  // Pocket Mode UI
  if (isPocketMode && !pocketModeUnlocked) {
    return (
      <div
        style={{
          width: '100%',
          height: '100vh',
          backgroundColor: '#000000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 1000,
        }}
        onTouchStart={handlePocketSlideStart}
        onTouchMove={handlePocketSlideMove}
        onTouchEnd={handlePocketSlideEnd}
      >
        <div
          style={{
            width: '80px',
            height: '10px',
            backgroundColor: '#333333',
            borderRadius: '10px',
            margin: '20px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '10px',
              backgroundColor: '#4CAF50',
              borderRadius: '10px',
              transform: `translateY(${Math.min(pocketSlidePosition / 10, 100)}px)`,
              transition: pocketSlidePosition === 0 ? 'transform 0.3s' : 'none',
            }}
          />
        </div>
        <p style={{ color: '#888888', marginBottom: '40px', fontSize: '14px' }}>
          Swipe up to unlock
        </p>
      </div>
    )
  }

  // Map View
  if (currentView === 'map') {
    // Filter pings based on selected carriers and status
    const filteredPings = mapPings.filter((ping) => {
      // Skip if no carrier filters selected
      if (selectedCarrierFilters.size === 0) return false
      
      // Check carrier filter
      const normalizedCarrier = normalizeCarrier(ping.carrier)
      if (!selectedCarrierFilters.has(normalizedCarrier)) {
        return false
      }
      
      // Check status filter - if no filters selected, show all
      if (selectedStatusFilters.size > 0) {
        if (!selectedStatusFilters.has(ping.status as 'HIGH' | 'TIMEOUT')) {
          return false
        }
      }
      return true
    })

    return (
      <>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
          }}
        >
          {/* Sticky Header with Settings */}
          <div
            style={{
              padding: '12px 15px',
              backgroundColor: '#f5f5f5',
              borderBottom: '1px solid #ddd',
              position: 'sticky',
              top: 0,
              zIndex: 100,
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
              <button
                onClick={() => setCurrentView('tracker')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
              >
                ← Live Tracker
              </button>
              <h2 style={{ margin: 0, flex: 1 }}>📍 Map View</h2>
              <span style={{ fontSize: '14px', color: '#666' }}>
                {filteredPings.length} / {mapPings.length} pings
              </span>

              {/* Experience Score Badge */}
              {pingStats.totalPings > 0 && (
                <div
                  style={{
                    padding: '8px 14px',
                    backgroundColor: pingStats.experienceScore >= 80 ? '#e8f5e9' : 
                                     pingStats.experienceScore >= 60 ? '#fff3e0' : '#ffebee',
                    color: pingStats.experienceScore >= 80 ? '#4CAF50' : 
                           pingStats.experienceScore >= 60 ? '#FFA500' : '#f44336',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: `2px solid ${pingStats.experienceScore >= 80 ? '#4CAF50' : 
                                        pingStats.experienceScore >= 60 ? '#FFA500' : '#f44336'}`,
                    position: 'relative',
                  }}
                  title={pingStats.isFiltered ? `Score: ${pingStats.experienceScore} (📍 Visible area only: ${pingStats.totalPings} pings)` : `Score: ${pingStats.experienceScore} (${pingStats.totalPings} pings total)`}
                >
                  <span>📊</span>
                  <span>Score: {pingStats.experienceScore}</span>
                  {pingStats.isFiltered && <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.8 }}>📍 AREA</span>}
                </div>
              )}

              {/* Offline Queue Status Indicator */}
              {offlineQueueSize > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#ff9800',
                      color: 'white',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }}
                  >
                    <span>⏳</span>
                    <span>{offlineQueueSize} pending</span>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Clear ${offlineQueueSize} pending pings? This cannot be undone.`)) {
                        clearOfflineQueue()
                        setOfflineQueueSize(0)
                        console.log('✅ Offline queue manually cleared')
                      }
                    }}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }}
                    title="Clear the offline queue - use only if queue is stuck"
                  >
                    🗑️ Clear
                  </button>
                </div>
              )}

              {!navigator.onLine && (
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }}
                >
                  <span>📵</span>
                  <span>Offline</span>
                </div>
              )}
            </div>

            {/* Carrier Selector */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
                Carrier:
              </label>
              <select
                value={activeCarrier}
                onChange={(e) => setActiveCarrier(e.target.value as Carrier)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid #333',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  color: '#000',
                  cursor: 'pointer',
                  minWidth: '150px',
                }}
              >
                <option value="AT&T">AT&T</option>
                <option value="Verizon">Verizon</option>
                <option value="T-Mobile">T-Mobile</option>
                <option value="UScellular">UScellular</option>
                <option value="Other">Other</option>
              </select>
              <span style={{ fontSize: '12px', color: '#666' }}>
                Active: <strong>{activeCarrier}</strong>
              </span>
            </div>

            {/* Status Filter */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>Status:</span>
              {[
                { label: 'High Latency', value: 'HIGH' as const },
                { label: 'Timed-out', value: 'TIMEOUT' as const },
              ].map((status) => (
                <button
                  key={status.value}
                  onClick={() => {
                    const newFilters = new Set(selectedStatusFilters)
                    if (newFilters.has(status.value)) {
                      newFilters.delete(status.value)
                    } else {
                      newFilters.add(status.value)
                    }
                    setSelectedStatusFilters(newFilters)
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: selectedStatusFilters.has(status.value) ? '2px solid #FF6B6B' : '1px solid #ccc',
                    backgroundColor: selectedStatusFilters.has(status.value) ? '#ffe3e3' : 'white',
                    color: selectedStatusFilters.has(status.value) ? '#FF6B6B' : '#666',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: selectedStatusFilters.has(status.value) ? 'bold' : 'normal',
                    transition: 'all 0.2s',
                  }}
                >
                  {status.label}
                </button>
              ))}
              {selectedStatusFilters.size > 0 && (
                <button
                  onClick={() => setSelectedStatusFilters(new Set())}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: '1px solid #999',
                    backgroundColor: 'white',
                    color: '#333',
                    cursor: 'pointer',
                    fontSize: '12px',
                    marginLeft: '4px',
                  }}
                >
                  Clear Status
                </button>
              )}
            </div>

            {/* Statistics Summary Row */}
            {pingStats.totalPings > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  marginBottom: '10px',
                  padding: '12px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>
                  Quick Stats{pingStats.isFiltered && ` (📍 Visible: ${pingStats.totalPings} pings)`}:
                </span>
                
                {/* OK Percentage */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    backgroundColor: '#e8f5e9',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  <span>✅</span>
                  <span style={{ fontWeight: 'bold', color: '#4CAF50' }}>
                    {pingStats.okPercentage}%
                  </span>
                  <span style={{ color: '#999' }}>OK</span>
                </div>

                {/* High Latency Percentage */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    backgroundColor: '#fff3e0',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  <span>⚠️</span>
                  <span style={{ fontWeight: 'bold', color: '#FFA500' }}>
                    {pingStats.highLatencyPercentage}%
                  </span>
                  <span style={{ color: '#999' }}>High Latency</span>
                </div>

                {/* Timed Out Percentage */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    backgroundColor: '#ffebee',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  <span>❌</span>
                  <span style={{ fontWeight: 'bold', color: '#f44336' }}>
                    {pingStats.timedOutPercentage}%
                  </span>
                  <span style={{ color: '#999' }}>Timed-out</span>
                </div>
              </div>
            )}

            {/* Filter Chips */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>Carrier:</span>
              {CARRIERS.map((carrier) => (
                <button
                  key={carrier}
                  onClick={() => {
                    const newFilters = new Set(selectedCarrierFilters)
                    if (newFilters.has(carrier)) {
                      newFilters.delete(carrier)
                    } else {
                      newFilters.add(carrier)
                    }
                    setSelectedCarrierFilters(newFilters)
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: selectedCarrierFilters.has(carrier) ? '2px solid #2196F3' : '1px solid #ccc',
                    backgroundColor: selectedCarrierFilters.has(carrier) ? '#e3f2fd' : 'white',
                    color: selectedCarrierFilters.has(carrier) ? '#2196F3' : '#666',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: selectedCarrierFilters.has(carrier) ? 'bold' : 'normal',
                    transition: 'all 0.2s',
                  }}
                >
                  {carrier}
                </button>
              ))}
              <button
                onClick={() => {
                  setSelectedCarrierFilters(new Set(CARRIERS))
                  setSelectedStatusFilters(new Set())
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  border: '1px solid #999',
                  backgroundColor: 'white',
                  color: '#333',
                  cursor: 'pointer',
                  fontSize: '12px',
                  marginLeft: '8px',
                }}
              >
                Reset All
              </button>
            </div>
          </div>

          {mapCenter && (
            <div ref={mapContainerRef} style={{ position: 'relative', flex: 1, width: '100%', height: '100%' }}>
              <MapContainer
                key="coverage-map"
                center={mapCenter}
                zoom={13}
                minZoom={2}
                maxZoom={25}
                style={{
                  width: '100%',
                  height: '100%',
                }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                />
                <MapRecenter mapPings={mapPings} location={location} />
                <RecenterButton 
                  mapPings={mapPings} 
                  location={location} 
                  containerRef={mapContainerRef}
                  isFollowing={isMapFollowing}
                  setIsFollowing={setIsMapFollowing}
                />
                <MapBoundsTracker onBoundsChange={setMapBounds} />

              {/* Current location marker */}
              {location.latitude && location.longitude && (
                <Marker
                  position={[location.latitude, location.longitude]}
                  icon={L.icon({
                    iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="blue"><circle cx="12" cy="12" r="8"/></svg>',
                    iconSize: [24, 24],
                  })}
                  eventHandlers={{
                    click: (e: any) => {
                      e.target.openPopup()
                    },
                  }}
                >
                  <Popup autoClose={false}>
                    <div>
                      <strong>📍 Your Location</strong>
                      <p>Lat: {location.latitude.toFixed(6)}</p>
                      <p>Lng: {location.longitude.toFixed(6)}</p>
                      <p>Accuracy: {location.accuracy?.toFixed(2)} m</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Ping markers - show only when carriers are selected */}
              {selectedCarrierFilters.size > 0 && filteredPings
                .filter(
                  (ping) =>
                    ping.latitude !== null &&
                    ping.longitude !== null
                )
                .map((ping, idx) => (
                  <Marker
                    key={ping.id || idx}
                    position={[ping.latitude!, ping.longitude!]}
                    icon={createMarkerIcon(ping.status, ping.latency_ms)}
                    eventHandlers={{
                      click: (e: any) => {
                        e.target.openPopup()
                      },
                    }}
                  >
                    <Popup autoClose={false}>
                      <div style={{ minWidth: '200px' }}>
                        <strong>
                          {ping.status === 'OK'
                            ? '✅'
                            : ping.status === 'HIGH'
                              ? '⚠️'
                              : '❌'}{' '}
                          {ping.status}
                        </strong>
                        <p>
                          Latency:{' '}
                          <strong>{ping.latency_ms ?? 'N/A'} ms</strong>
                        </p>
                        <p>
                          Accuracy:{' '}
                          <strong>{ping.accuracy?.toFixed(2) ?? 'N/A'} m</strong>
                        </p>
                        <p>
                          Location: <strong>{ping.latitude?.toFixed(6)}, {ping.longitude?.toFixed(6)}</strong>
                        </p>
                        <p>
                          Carrier: <strong>{ping.carrier}</strong>
                        </p>
                        <p>
                          Device: <strong>{ping.device_model}</strong>
                        </p>
                        <p>
                          Connection: <strong>{ping.connection_type || 'N/A'}</strong>
                        </p>
                        <p>
                          OS: <strong>{ping.device_os || 'N/A'}</strong>
                        </p>
                        {ping.created_at && (
                          <p>
                            Date:{' '}
                            <strong>
                              {new Date(ping.created_at).toLocaleDateString()} {new Date(ping.created_at).toLocaleTimeString()}
                            </strong>
                          </p>
                        )}
                        {ping.session_id && (
                          <p>
                            Session ID:{' '}
                            <strong style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                              {ping.session_id}
                            </strong>
                          </p>
                        )}
                        {ping.browser_platform && (
                          <p>
                            Browser Platform:{' '}
                            <strong>{ping.browser_platform}</strong>
                          </p>
                        )}
                        {ping.reported_os && (
                          <p>
                            Reported OS:{' '}
                            <strong>{ping.reported_os}</strong>
                          </p>
                        )}
                        {ping.test_endpoint && (
                          <p>
                            Test Endpoint:{' '}
                            <strong style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                              {ping.test_endpoint}
                            </strong>
                          </p>
                        )}
                        {ping.app_version && (
                          <p>
                            App Version:{' '}
                            <strong>{ping.app_version}</strong>
                          </p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}
        </div>
      </>
    )
  }

  // Live Tracker View
  return (
    <>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>Coverage Mapper</h1>
          <p>Track network coverage and latency with Supabase</p>
        </div>

        <div
          style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            display: 'flex',
            gap: '10px',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <button
            onClick={() => setCurrentView('tracker')}
            style={{
              padding: '10px 20px',
              backgroundColor: currentView === 'tracker' ? '#2196F3' : '#ddd',
              color: currentView === 'tracker' ? 'white' : '#333',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Live Tracker
          </button>
          <button
            onClick={() => setCurrentView('map')}
            style={{
              padding: '10px 20px',
              backgroundColor: (currentView as string) === 'map' ? '#2196F3' : '#ddd',
              color: (currentView as string) === 'map' ? 'white' : '#333',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            📍 Map View
          </button>

          {/* Offline Queue Status Indicator */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
            {offlineQueueSize > 0 && (
              <>
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }}
                >
                  <span>⏳</span>
                  <span>{offlineQueueSize} pending</span>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Clear ${offlineQueueSize} pending pings? This cannot be undone.`)) {
                      clearOfflineQueue()
                      setOfflineQueueSize(0)
                      console.log('✅ Offline queue manually cleared')
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }}
                  title="Clear the offline queue - use only if queue is stuck"
                >
                  🗑️ Clear
                </button>
              </>
            )}

            {!navigator.onLine && (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                }}
              >
                <span>📵</span>
                <span>Offline</span>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: '20px',
            padding: '20px',
            border: '1px solid #ccc',
            borderRadius: '8px',
          }}
        >
          <h2>Location & Device Info</h2>
          <p>
            📍 Latitude: {location.latitude?.toFixed(6) || 'Loading...'}
          </p>
          <p>
            📍 Longitude: {location.longitude?.toFixed(6) || 'Loading...'}
          </p>
          <p>📏 Accuracy: {location.accuracy?.toFixed(2) || 'N/A'} m</p>
          <p>🔌 Connection: {getConnectionType() || 'N/A'}</p>
          <p>💻 Device OS: {getDeviceOS()}</p>
          <p>📱 Device Model: {deviceModelRef.current}</p>
          <p>
            📡 Carrier: <strong>{activeCarrier}</strong>
            {' '}
            <select
              value={activeCarrier}
              onChange={(e) => setActiveCarrier(e.target.value as Carrier)}
              style={{
                marginLeft: '10px',
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid #333',
                fontSize: '14px',
                backgroundColor: '#ffffff',
                color: '#000',
                cursor: 'pointer',
              }}
            >
              <option value="AT&T">AT&T</option>
              <option value="Verizon">Verizon</option>
              <option value="T-Mobile">T-Mobile</option>
              <option value="UScellular">UScellular</option>
              <option value="Other">Other</option>
            </select>
          </p>
        </div>

        <div
          style={{
            marginTop: '20px',
            padding: '20px',
            border: '1px solid #ccc',
            borderRadius: '8px',
          }}
        >
          <h2>Tracking Control</h2>
          <button
            type="button"
            className="counter"
            onClick={handleToggleTracking}
            style={{
              cursor: 'pointer',
              backgroundColor: isTracking ? '#ff4444' : '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              fontSize: '16px',
              marginBottom: '15px',
            }}
          >
            {isTracking ? '⏹ Stop Tracking' : '▶ Start Tracking'}
          </button>
          {isTracking && (
            <p style={{ color: '#4CAF50', fontWeight: 'bold' }}>
              ● Live tracking active - pinging every 3 seconds
            </p>
          )}
          <p style={{ fontSize: '16px', color: '#333' }}>Total pings recorded: {mapPings.length}</p>
        </div>

        <div
          style={{
            marginTop: '20px',
            padding: '20px',
            border: '1px solid #ccc',
            borderRadius: '8px',
            backgroundColor: '#fafafa',
          }}
        >
          <h2>Network Statistics & Experience Score</h2>
          {pingStats.totalPings === 0 ? (
            <p style={{ color: '#999' }}>Start tracking to see statistics</p>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '15px',
                  marginBottom: '20px',
                }}
              >
                {/* OK Status */}
                <div
                  style={{
                    padding: '15px',
                    backgroundColor: '#e8f5e9',
                    borderRadius: '6px',
                    textAlign: 'center',
                    borderLeft: '4px solid #4CAF50',
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>✅ OK</p>
                  <p style={{ margin: '0', fontSize: '28px', fontWeight: 'bold', color: '#4CAF50' }}>
                    {pingStats.okPercentage}%
                  </p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#999' }}>
                    {pingStats.okCount} pings
                  </p>
                </div>

                {/* High Latency Status */}
                <div
                  style={{
                    padding: '15px',
                    backgroundColor: '#fff3e0',
                    borderRadius: '6px',
                    textAlign: 'center',
                    borderLeft: '4px solid #FFA500',
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>⚠️ High Latency</p>
                  <p style={{ margin: '0', fontSize: '28px', fontWeight: 'bold', color: '#FFA500' }}>
                    {pingStats.highLatencyPercentage}%
                  </p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#999' }}>
                    {pingStats.highLatencyCount} pings
                  </p>
                </div>

                {/* Timed Out Status */}
                <div
                  style={{
                    padding: '15px',
                    backgroundColor: '#ffebee',
                    borderRadius: '6px',
                    textAlign: 'center',
                    borderLeft: '4px solid #f44336',
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>❌ Timed-out</p>
                  <p style={{ margin: '0', fontSize: '28px', fontWeight: 'bold', color: '#f44336' }}>
                    {pingStats.timedOutPercentage}%
                  </p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#999' }}>
                    {pingStats.timedOutCount} pings
                  </p>
                </div>
              </div>

              {/* Experience Score */}
              <div
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  border: '2px solid #2196F3',
                  textAlign: 'center',
                }}
              >
                <p style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 'bold', color: '#333' }}>
                  📊 Network Experience Score
                </p>
                <div
                  style={{
                    fontSize: '48px',
                    fontWeight: 'bold',
                    color: pingStats.experienceScore >= 80 ? '#4CAF50' : 
                           pingStats.experienceScore >= 60 ? '#FFA500' : '#f44336',
                    marginBottom: '10px',
                  }}
                >
                  {pingStats.experienceScore}
                </div>
                <p style={{ margin: '0', fontSize: '14px', color: '#666' }}>
                  {pingStats.experienceScore >= 80
                    ? '✅ Excellent network quality'
                    : pingStats.experienceScore >= 60
                    ? '⚠️ Moderate network quality - some issues detected'
                    : '❌ Poor network quality - significant issues'}
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#999' }}>
                  Based on {pingStats.totalPings} total pings
                </p>
              </div>
            </>
          )}
        </div>

        <div
          style={{
            marginTop: '20px',
            padding: '20px',
            border: '1px solid #ccc',
            borderRadius: '8px',
          }}
        >
          <h2>Display Modes</h2>
          <button
            type="button"
            onClick={() => {
              if (isPocketMode) {
                handleExitPocketMode()
              } else {
                setIsPocketMode(true)
              }
            }}
            style={{
              cursor: 'pointer',
              backgroundColor: isPocketMode ? '#FFA500' : '#2196F3',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              fontSize: '16px',
              marginRight: '10px',
            }}
          >
            {isPocketMode ? '🔓 Exit Pocket Mode' : '🌙 OLED Pocket Mode'}
          </button>
        </div>

      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
