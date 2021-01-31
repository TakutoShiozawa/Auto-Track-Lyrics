on GetTimeTable(trackTitle, trackArtist)
  tell application "Finder"
    set fileName to trackTitle & " - " & trackArtist & ".txt"
		set srcPath to parent of parent of (path to me) as text
    set filePath to srcPath & "time_tables:" & fileName
    set textData to ""
    set existing to exists filePath
    if existing is equal to true then
      try
        set theFile to open for access file filePath
        set textdata to read theFile
      on error
      end try
      close access file filePath
      if not (textData is equal to "") then
        set LyricsToArray to load script file (srcPath & "scripts:LyricsToArray.scpt")
        tell LyricsToArray
          set textData to SetLyricsToArray(textData)
        end tell
      end if
    else
      return "??????????????"
    end if
    return textData
  end tell
end GetTimeTable

on CreateTimeTable(trackTitle, trackArtist, timeTableList)
  set timeTable to ""
  repeat with cnt in timeTableList
    set timeTable to timeTable & cnt & return
  end repeat

  tell application "Finder"
    set fileName to trackTitle & " - " & trackArtist & ".txt"
    set srcPath to parent of parent of (path to me) as text
    set filePath to srcPath & "time_tables:" & fileName
    set aTextFile to open for access fileName with write permission
    try
      set eof of aTextFile to ""
      write timeTable to aTextFile
    on error
    end try
    close access aTextFile
  end tell
end CreateTimeTable

on run argv
  set command to item 1 of argv
  set trackTitle to item 2 of argv
  set trackArtist to item 3 of argv
  if command is "get"
    return GetTimeTable(trackTitle, trackArtist)
  else if command is "create" then
    set timeTableList to items 4 thru -1 of argv
    CreateTimeTable(trackTitle, trackArtist, timeTableList)
  else
    return "{\"error\":\"Unsupported command\"}"
  end if
end run