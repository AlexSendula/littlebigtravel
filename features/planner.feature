Feature: Planner generation
  Planner edits generate the linked trip structure shown in the timeline.

  Scenario: Starting travel creates one linked arrival base
    Given I open a clean app
    And I create a trip named "Planner Test"
    When I open the trip planner
    And I add starting travel from "Amsterdam" to "Santiago"
    Then the planner shows one starting travel
    And the planner shows one base city named "Santiago"
    And the planner shows one arrival item named "Arrive at Santiago"

  Scenario: Editing starting travel destination does not create duplicate base cities
    Given I have starting travel from "Amsterdam" to "Santiago"
    When I edit the starting travel destination to "Mendoza"
    Then the planner shows one base city named "Mendoza"
    And the planner does not show partial base cities

  Scenario: A linked generated item can be hidden and regenerated
    Given I have starting travel from "Amsterdam" to "Santiago"
    When I hide the generated arrival item
    Then the generated arrival item is not shown
    When I enable linked items again
    Then the generated arrival item is shown

  Scenario: Add an activity with a valid place and expose the map option
    Given I have a Santiago base trip
    When I add an activity named "Laguna walk" with place "El Chalten"
    Then the activity editor shows the map option
    When I enable show on map for the activity
    Then the active planner has a mappable activity named "Laguna walk"

  Scenario: Add a stay and generate check-in and check-out moments
    Given I have a Santiago base trip
    When I add a stay at "Santiago"
    Then the planner shows one linked check-in item
    And the planner shows one linked check-out item

  Scenario: Delete empty day without confirmation and non-empty day with confirmation
    Given I have a Santiago base trip with an empty day and a planned day
    When I delete the empty day
    Then the planner does not ask for confirmation
    And the planner no longer shows the empty day
    When I delete the planned day
    Then the planner asks for delete confirmation

  Scenario: Date and time pickers close without focusing notes
    Given I have a Santiago base trip
    When I open a new departure editor
    And I select a departure date from the picker
    Then the date picker is closed
    And the notes field is not focused
    When I select a departure time from the picker
    Then the time picker is closed
    And the notes field is not focused
