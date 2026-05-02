Feature: Trip management
  The app stores multiple local trips and lets the user switch between them.

  Scenario: Create the first trip from an empty app
    Given I open a clean app
    When I open the trip menu
    And I create a trip named "Patagonia Test"
    Then the active trip is "Patagonia Test"
    And the trip menu lists "Patagonia Test"

  Scenario: Create a trip with a date range
    Given I open a clean app
    When I open the trip menu
    And I create a trip named "May Trip" from "2026-05-01" to "2026-05-10"
    Then the active trip is "May Trip"
    And the active trip dates are "1 May - 10 May"

  Scenario: Create multiple trips and switch the active trip
    Given I have two active trips named "Patagonia Test" and "Thailand Test"
    When I open the trip menu
    And I select the trip named "Thailand Test"
    Then the active trip is "Thailand Test"

  Scenario: Unarchiving a trip does not steal the active trip
    Given I have an active trip named "Current Trip" and an archived trip named "Old Trip"
    When I open the trip menu
    And I show archived trips
    And I restore the trip named "Old Trip"
    Then the active trip is "Current Trip"
    And the trip menu lists "Old Trip"
