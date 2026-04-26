package usercommands

import (
	"github.com/GoMudEngine/GoMud/internal/events"
	"github.com/GoMudEngine/GoMud/internal/rooms"
	"github.com/GoMudEngine/GoMud/internal/users"
)

// Default is a special command that tries to contextually pick a default action for a room.
// The failover is to "look"
func Default(rest string, user *users.UserRecord, room *rooms.Room, flags events.EventFlag) (bool, error) {

	// If there is a shop, "list"
	if len(room.GetMobs(rooms.FindMerchant)) > 0 || len(room.GetPlayers(rooms.FindMerchant)) > 0 {
		List(``, user, room, flags)
		return true, nil
	}

	// If there is a trainer, "train"
	if len(room.SkillTraining) > 0 {
		Train(``, user, room, flags)
		return true, nil
	}

	// If a bank, "bank"
	if room.IsBank {
		Bank(``, user, room, flags)
		return true, nil
	}

	// If a storage location, "storage"
	if room.HasTag(`storage`) {
		// Dispatch via the event queue so we do not create an init cycle
		// with the storage module's RegisterCommand call.
		user.Command(`storage`)
		return true, nil
	}

	// Default to "look"
	Look(``, user, room, flags)

	return true, nil
}
