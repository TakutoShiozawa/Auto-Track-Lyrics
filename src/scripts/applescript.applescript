on IsRunning()
	tell application "System Events"
		set iTunesIsRunning to exists (processes where name is "iTunes")
	end tell

	return iTunesIsRunning
end IsRunning

on IsPlaying()
  if IsRunning() then
    tell application "iTunes"
      return player state is playing
    end tell
  else
    return false
  end if
end IsPlaying

on GetCurrentTrack()
  if IsPlaying() then
    tell application "iTunes"
      if not (exists current track) then
        return "再生中の曲を取得できません"
      end if
      set trackTitle to (name of current track)
      set trackArtist to (artist of current track)
      set trackLyrics to (lyrics of current track)
      return "{\"name\":\"" & trackTitle & "\",\"artist\":\"" & trackArtist & "\"}"
    end tell
  else
    return "曲を再生してください"
  end if
end GetCurrentTrack

on run argv
  set command to item 1 of argv
  if command is "currenttrack" then
    return GetCurrentTrack()
  else
    return "{\"error\":\"Unsupported command\"}"
  end if
end run