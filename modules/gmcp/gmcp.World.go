package gmcp

import (
	"strconv"

	"github.com/GoMudEngine/GoMud/internal/events"
	"github.com/GoMudEngine/GoMud/internal/mapper"
	"github.com/GoMudEngine/GoMud/internal/mudlog"
	"github.com/GoMudEngine/GoMud/internal/plugins"
	"github.com/GoMudEngine/GoMud/internal/rooms"
	"github.com/GoMudEngine/GoMud/internal/users"
)

// ////////////////////////////////////////////////////////////////////
// NOTE: The init function in Go is a special function that is
// automatically executed before the main function within a package.
// It is used to initialize variables, set up configurations, or
// perform any other setup tasks that need to be done before the
// program starts running.
// ////////////////////////////////////////////////////////////////////
func init() {

	g := GMCPWorldModule{
		plug: plugins.New(`gmcp.World`, `1.0`),
	}

	events.RegisterListener(GMCPWorldUpdate{}, g.buildAndSendGMCPPayload)

}

type GMCPWorldModule struct {
	plug *plugins.Plugin
}

// GMCPWorldUpdate is fired when a client explicitly requests World data.
type GMCPWorldUpdate struct {
	UserId     int
	Identifier string
}

func (g GMCPWorldUpdate) Type() string { return `GMCPWorldUpdate` }

func (g *GMCPWorldModule) buildAndSendGMCPPayload(e events.Event) events.ListenerReturn {

	evt, typeOk := e.(GMCPWorldUpdate)
	if !typeOk {
		mudlog.Error("Event", "Expected Type", "GMCPWorldUpdate", "Actual Type", e.Type())
		return events.Cancel
	}

	if evt.UserId < 1 {
		return events.Continue
	}

	user := users.GetByUserId(evt.UserId)
	if user == nil {
		return events.Continue
	}

	if !isGMCPEnabled(user.ConnectionId()) {
		return events.Cancel
	}

	if evt.Identifier != `World.Map` {
		mudlog.Error(`gmcp.World`, `error`, `Unknown identifier`, `identifier`, evt.Identifier)
		return events.Continue
	}

	payload := g.buildWorldMap(user)

	events.AddToQueue(GMCPOut{
		UserId:  evt.UserId,
		Module:  `World.Map`,
		Payload: payload,
	})

	return events.Continue
}

// buildWorldMap assembles a Room.Info-shaped payload for every room the player
// has visited, across all zones.
func (g *GMCPWorldModule) buildWorldMap(user *users.UserRecord) []GMCPWorldMap_RoomEntry {

	entries := []GMCPWorldMap_RoomEntry{}

	if user.Character.ZonesVisited == nil {
		return entries
	}

	// Pre-build a set of zone root room IDs so we can tag them efficiently
	// while iterating over all visited rooms below.
	zoneRoots := map[int]struct{}{}
	for zoneName := range user.Character.ZonesVisited {
		if rootId, err := rooms.GetZoneRoot(zoneName); err == nil {
			zoneRoots[rootId] = struct{}{}
		}
	}

	for _, bitset := range user.Character.ZonesVisited {
		for roomId := range bitset.ToSet() {

			room := rooms.LoadRoom(roomId)
			if room == nil {
				continue
			}

			entry := GMCPWorldMap_RoomEntry{
				Id:          room.RoomId,
				Name:        room.Title,
				Area:        room.Zone,
				Environment: room.GetBiome().Name,
				MapSymbol:   room.GetMapSymbol(),
				MapLegend:   room.MapLegend,
				Details:     []string{},
				Exits:       map[string]int{},
				ExitsV2:     map[string]GMCPRoomModule_Payload_Contents_ExitInfo{},
			}

			// Coordinates
			entry.Coordinates = room.Zone
			m := mapper.GetMapper(room.RoomId)
			x, y, z, err := m.GetCoordinates(room.RoomId)
			if err != nil {
				entry.Coordinates += `, 999999999999999999, 999999999999999999, 999999999999999999`
			} else {
				entry.Coordinates += `, ` + strconv.Itoa(x) + `, ` + strconv.Itoa(y) + `, ` + strconv.Itoa(z)
			}

			// Exits — only include exits to rooms the player has also visited,
			// and respect secret exits the player hasn't discovered.
			for exitName, exitInfo := range room.Exits {

				if exitInfo.Secret {
					if exitRoom := rooms.LoadRoom(exitInfo.RoomId); exitRoom != nil {
						if !user.Character.HasVisitedRoom(exitInfo.RoomId, exitRoom.Zone) {
							continue
						}
					}
				}

				entry.Exits[exitName] = exitInfo.RoomId

				deltaX, deltaY, deltaZ := 0, 0, 0
				if len(exitInfo.MapDirection) > 0 {
					deltaX, deltaY, deltaZ = mapper.GetDelta(exitInfo.MapDirection)
				} else {
					deltaX, deltaY, deltaZ = mapper.GetDelta(exitName)
				}

				exitV2Details := []string{}
				if exitInfo.Secret {
					exitV2Details = append(exitV2Details, `secret`)
				}
				if exitInfo.HasLock() {
					exitV2Details = append(exitV2Details, `locked`)
				}

				entry.ExitsV2[exitName] = GMCPRoomModule_Payload_Contents_ExitInfo{
					RoomId:  exitInfo.RoomId,
					DeltaX:  deltaX,
					DeltaY:  deltaY,
					DeltaZ:  deltaZ,
					Details: exitV2Details,
				}
			}

			// Room details flags
			if len(room.SkillTraining) > 0 {
				entry.Details = append(entry.Details, `trainer`)
			}
			if room.IsBank {
				entry.Details = append(entry.Details, `bank`)
			}
			for _, tag := range room.GetTags() {
				entry.Details = append(entry.Details, tag)
			}
			if room.IsPvp() {
				entry.Details = append(entry.Details, `pvp`)
			}
			if rooms.IsEphemeralRoomId(room.RoomId) {
				entry.Details = append(entry.Details, `ephemeral`)
			}
			if _, isRoot := zoneRoots[room.RoomId]; isRoot {
				entry.Details = append(entry.Details, `root`)
			}

			entries = append(entries, entry)
		}
	}

	return entries
}

// GMCPWorldMap_RoomEntry mirrors the shape of GMCPRoomModule_Payload but
// omits the live Contents (players, npcs, items) since this is a static
// visited-rooms snapshot.
type GMCPWorldMap_RoomEntry struct {
	Id          int                                                 `json:"num"`
	Name        string                                              `json:"name"`
	Area        string                                              `json:"area"`
	Environment string                                              `json:"environment"`
	Coordinates string                                              `json:"coords"`
	MapSymbol   string                                              `json:"mapsymbol"`
	MapLegend   string                                              `json:"maplegend"`
	Exits       map[string]int                                      `json:"exits"`
	ExitsV2     map[string]GMCPRoomModule_Payload_Contents_ExitInfo `json:"exitsv2"`
	Details     []string                                            `json:"details"`
}
