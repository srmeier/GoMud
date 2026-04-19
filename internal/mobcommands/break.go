package mobcommands

import (
	"fmt"

	"github.com/GoMudEngine/GoMud/internal/events"
	"github.com/GoMudEngine/GoMud/internal/mobs"
	"github.com/GoMudEngine/GoMud/internal/rooms"
)

func Break(rest string, mob *mobs.Mob, room *rooms.Room) (bool, error) {

	if mob.Character.Aggro != nil {
		mob.Character.Aggro = nil
		events.AddToQueue(events.AggroChanged{MobInstanceId: mob.InstanceId, RoomId: mob.Character.RoomId})
		room.SendText(
			fmt.Sprintf(`<ansi fg="mobname">%s</ansi> breaks off combat.`, mob.Character.Name))
	}

	return true, nil
}
