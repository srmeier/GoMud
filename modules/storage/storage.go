package storage

import (
	"embed"
	"fmt"
	"strconv"
	"strings"

	"github.com/GoMudEngine/GoMud/internal/events"
	"github.com/GoMudEngine/GoMud/internal/items"
	"github.com/GoMudEngine/GoMud/internal/plugins"
	"github.com/GoMudEngine/GoMud/internal/rooms"
	"github.com/GoMudEngine/GoMud/internal/suggestions"
	"github.com/GoMudEngine/GoMud/internal/term"
	"github.com/GoMudEngine/GoMud/internal/users"
	"github.com/GoMudEngine/GoMud/internal/util"
)

var (
	//go:embed files/*
	files embed.FS
)

const (
	storageTag = "storage"
	maxItems   = 20
	storageKey = "storage-user-%d"
)

func init() {
	m := &StorageModule{
		plug:    plugins.New(`storage`, `1.0`),
		storage: make(map[int]StorageData),
	}

	if err := m.plug.AttachFileSystem(files); err != nil {
		panic(err)
	}

	m.plug.AddUserCommand(`storage`, m.storageCommand, false, false)

	m.plug.ReserveTags(`storage`)

	m.plug.Callbacks.SetOnSave(m.onSave)

	m.plug.ExportFunction(`GetStorageItems`, m.GetStorageItems)
	m.plug.ExportFunction(`AddStorageItem`, m.AddStorageItem)
	m.plug.ExportFunction(`RemoveStorageItem`, m.RemoveStorageItem)

	m.plug.Web.AdminPage(
		"View / Edit",
		"storage",
		"html/admin/storage.html",
		true,
		"Modules",
		"Storage",
		nil,
	)

	m.plug.Web.AdminPage(
		"API Docs",
		"storage-api",
		"html/admin/storage-api.html",
		true,
		"Modules",
		"Storage",
		nil,
	)

	m.plug.Web.AdminAPIEndpoint("GET", "storage", m.apiAdminGetStorage)
	m.plug.Web.AdminAPIEndpoint("DELETE", "storage", m.apiAdminDeleteStorageItem)

	events.RegisterListener(events.PlayerDespawn{}, m.onPlayerDespawn)
	events.RegisterListener(events.PlayerSpawn{}, m.onPlayerSpawn)

	rooms.OnRoomLook.Register(m.onRoomLook)
	suggestions.OnAutoComplete.Register(m.onAutoComplete)
}

// StorageData holds the items stored for a single user.
type StorageData struct {
	Items []items.Item `yaml:"items,omitempty"`
}

func (s *StorageData) getItems() []items.Item {
	return append([]items.Item{}, s.Items...)
}

func (s *StorageData) findItem(itemName string) (items.Item, bool) {
	if itemName == `` {
		return items.Item{}, false
	}
	closeMatch, exactMatch := items.FindMatchIn(itemName, s.Items...)
	if exactMatch.ItemId != 0 {
		return exactMatch, true
	}
	if closeMatch.ItemId != 0 {
		return closeMatch, true
	}
	return items.Item{}, false
}

func (s *StorageData) addItem(i items.Item) bool {
	if i.ItemId < 1 {
		return false
	}
	s.Items = append(s.Items, i)
	return true
}

func (s *StorageData) removeItem(i items.Item) bool {
	for j := len(s.Items) - 1; j >= 0; j-- {
		if s.Items[j].Equals(i) {
			s.Items = append(s.Items[:j], s.Items[j+1:]...)
			return true
		}
	}
	return false
}

// StorageModule owns all storage state.
type StorageModule struct {
	plug    *plugins.Plugin
	storage map[int]StorageData // keyed by userId; loaded on PlayerSpawn
}

func dataKey(userId int) string {
	return fmt.Sprintf(storageKey, userId)
}

func (m *StorageModule) load(userId int) StorageData {
	var data StorageData
	m.plug.ReadIntoStruct(dataKey(userId), &data)
	return data
}

func (m *StorageModule) save(userId int, data StorageData) {
	m.plug.WriteStruct(dataKey(userId), data)
}

func (m *StorageModule) onSave() {
	for userId, data := range m.storage {
		m.save(userId, data)
	}
}

func (m *StorageModule) onPlayerSpawn(e events.Event) events.ListenerReturn {
	evt, ok := e.(events.PlayerSpawn)
	if !ok {
		return events.Continue
	}
	m.storage[evt.UserId] = m.load(evt.UserId)
	return events.Continue
}

func (m *StorageModule) onPlayerDespawn(e events.Event) events.ListenerReturn {
	evt, ok := e.(events.PlayerDespawn)
	if !ok {
		return events.Continue
	}
	if data, exists := m.storage[evt.UserId]; exists {
		m.save(evt.UserId, data)
		delete(m.storage, evt.UserId)
	}
	return events.Continue
}

// onAutoComplete contributes completions for the storage command.
func (m *StorageModule) onAutoComplete(req suggestions.AutoCompleteRequest) suggestions.AutoCompleteRequest {
	if req.Cmd != `storage` {
		return req
	}

	user := users.GetByUserId(req.UserId)
	if user == nil {
		return req
	}

	parts := req.Parts
	targetName := strings.ToLower(strings.Join(parts[1:], ` `))
	targetNameLen := len(targetName)

	for _, opt := range []string{`add`, `remove`} {
		if strings.HasPrefix(opt, targetName) {
			req.Results = append(req.Results, opt[targetNameLen:])
		}
	}

	if len(parts) >= 3 {
		subCmd := strings.ToLower(parts[1])
		itemSearch := strings.ToLower(strings.Join(parts[2:], ` `))
		itemSearchLen := len(itemSearch)
		if subCmd == `add` {
			for _, item := range user.Character.GetAllBackpackItems() {
				iSpec := item.GetSpec()
				if strings.HasPrefix(strings.ToLower(iSpec.Name), itemSearch) {
					req.Results = append(req.Results, iSpec.Name[itemSearchLen:])
				}
			}
		} else if subCmd == `remove` {
			for _, item := range m.GetStorageItems(user.UserId) {
				iSpec := item.GetSpec()
				if strings.HasPrefix(strings.ToLower(iSpec.Name), itemSearch) {
					req.Results = append(req.Results, iSpec.Name[itemSearchLen:])
				}
			}
		}
	}

	return req
}

// onRoomLook injects a storage alert when the room has the storage tag.
func (m *StorageModule) onRoomLook(d rooms.RoomTemplateDetails) rooms.RoomTemplateDetails {
	for _, t := range d.Tags {
		if strings.EqualFold(t, storageTag) {
			d.RoomAlerts = append(d.RoomAlerts,
				` <ansi fg="yellow-bold">This is an item storage location!</ansi> Type <ansi fg="command">storage</ansi> to store/unstore.`,
			)
			return d
		}
	}
	return d
}

// roomIsStorage returns true if the room has the storage tag.
func roomIsStorage(room *rooms.Room) bool {
	return room.HasTag(storageTag)
}

// GetStorageItems is exported for use by other systems (e.g. autocomplete).
func (m *StorageModule) GetStorageItems(userId int) []items.Item {
	if data, ok := m.storage[userId]; ok {
		return data.getItems()
	}
	return nil
}

// AddStorageItem is exported for cross-module use.
func (m *StorageModule) AddStorageItem(userId int, itm items.Item) bool {
	data := m.storage[userId]
	if !data.addItem(itm) {
		return false
	}
	m.storage[userId] = data
	return true
}

// RemoveStorageItem is exported for cross-module use.
func (m *StorageModule) RemoveStorageItem(userId int, itm items.Item) bool {
	data := m.storage[userId]
	if !data.removeItem(itm) {
		return false
	}
	m.storage[userId] = data
	return true
}

func (m *StorageModule) storageCommand(rest string, user *users.UserRecord, room *rooms.Room, flags events.EventFlag) (bool, error) {

	if !roomIsStorage(room) {
		user.SendText(`You are not at a storage location.` + term.CRLFStr)

		if len(room.Containers) > 0 {
			cName := ``
			for k := range room.Containers {
				cName = k
				break
			}
			user.SendText(fmt.Sprintf(`Maybe you meant to use the <ansi fg="command">put</ansi> command to <ansi fg="command">put</ansi> something into the <ansi fg="container">%s</ansi>?`, cName) + term.CRLFStr)
		}

		return true, nil
	}

	data := m.storage[user.UserId]
	itemsInStorage := data.getItems()

	if rest == `` || rest == `remove` {

		itemNames := []string{}
		for _, item := range itemsInStorage {
			itemNames = append(itemNames, item.NameComplex())
		}

		storageTxt := buildStorageText(itemNames)
		user.SendText(storageTxt)

		return true, nil
	}

	if rest == `add` || rest == `remove` {
		user.SendText(fmt.Sprintf(`%s what?%s`, rest, term.CRLFStr))
		return true, nil
	}

	args := util.SplitButRespectQuotes(strings.ToLower(rest))

	if len(args) < 2 || (args[0] != `add` && args[0] != `remove`) {
		user.SendText(`Try <ansi fg="command">help storage</ansi> for more information about storage.` + term.CRLFStr)
		return true, nil
	}

	action := args[0]
	itemName := strings.Join(args[1:], ` `)

	if action == `add` {

		spaceLeft := maxItems - len(itemsInStorage)
		if spaceLeft < 1 {
			user.SendText(fmt.Sprintf(`You can have %d objects in storage`, maxItems))
			return true, nil
		}

		if itemName == `all` {
			for _, itm := range user.Character.GetAllBackpackItems() {
				m.storageCommand(fmt.Sprintf(`add !%d`, itm.ItemId), user, room, flags)
				spaceLeft--
				if spaceLeft < 0 {
					break
				}
			}
			return true, nil
		}

		itm, found := user.Character.FindInBackpack(itemName)
		if !found {
			user.SendText(fmt.Sprintf(`You don't have a %s to add to storage.%s`, itemName, term.CRLFStr))
			return true, nil
		}

		user.Character.RemoveItem(itm)
		data.addItem(itm)
		m.storage[user.UserId] = data

		events.AddToQueue(events.ItemOwnership{
			UserId: user.UserId,
			Item:   itm,
			Gained: false,
		})

		user.SendText(fmt.Sprintf(`You placed the <ansi fg="itemname">%s</ansi> into storage.`, itm.DisplayName()))

	} else if action == `remove` {

		if itemName == `all` {
			for _, itm := range data.getItems() {
				m.storageCommand(fmt.Sprintf(`remove !%d`, itm.ItemId), user, room, flags)
			}
			return true, nil
		}

		var itm items.Item
		var found bool
		itmIdx, _ := strconv.Atoi(itemName)

		if itmIdx > 0 {
			itmIdx -= 1
			for i, storageItm := range itemsInStorage {
				if itmIdx == i {
					itm = storageItm
					found = true
					break
				}
			}
		} else {
			itm, found = data.findItem(itemName)
		}

		if !found {
			user.SendText(fmt.Sprintf(`You don't have a %s in storage.`, itemName))
			return true, nil
		}

		if user.Character.StoreItem(itm) {

			events.AddToQueue(events.ItemOwnership{
				UserId: user.UserId,
				Item:   itm,
				Gained: true,
			})

			data.removeItem(itm)
			m.storage[user.UserId] = data

			user.SendText(fmt.Sprintf(`You removed the <ansi fg="itemname">%s</ansi> from storage.`, itm.DisplayName()))

		} else {
			user.SendText(`You can't carry that!`)
		}
	}

	return true, nil
}

// buildStorageText renders the storage listing for the player.
func buildStorageText(itemNames []string) string {
	if len(itemNames) == 0 {
		return `<ansi fg="yellow">Your storage is empty.</ansi>` + "\n"
	}

	var sb strings.Builder
	sb.WriteString(`<ansi fg="yellow-bold">Items in storage:</ansi>` + "\n")
	for i, name := range itemNames {
		sb.WriteString(fmt.Sprintf(`  <ansi fg="cyan">%d)</ansi> <ansi fg="itemname">%s</ansi>%s`, i+1, name, "\n"))
	}
	return sb.String()
}
