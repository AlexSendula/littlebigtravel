Feature: Gmail foreground auto-import
  Gmail import runs locally while the app is open and creates only high-confidence planner items.

  Scenario: Connect Gmail and import flight and hotel confirmations
    Given I open a clean app
    And I create a trip named "Import Test"
    And Gmail has a flight confirmation from "Amsterdam, Netherlands" to "Santiago, Chile"
    And Gmail has a hotel confirmation for "Walking Santiago Boutique Hostel"
    When I connect Gmail auto-import
    Then Gmail auto-import is connected
    And the active planner has one imported starting travel
    And the active planner has one imported stay
    When I open the trip planner
    Then the planner shows one base city named "Santiago"
    And the planner shows one arrival item named "Arrive at Santiago"
    And the planner shows one linked check-in item
    And the planner shows one linked check-out item

  Scenario: Repeated foreground checks do not duplicate imported items
    Given I open a clean app
    And I create a trip named "Import Test"
    And Gmail has a flight confirmation from "Amsterdam, Netherlands" to "Santiago, Chile"
    When I connect Gmail auto-import
    Then the active planner has one imported starting travel
    When Gmail checks again
    Then the active planner has one imported starting travel

  Scenario: Gmail checks use only the active trip context
    Given I open a clean app
    And I create a trip named "Chile Trip" from "2026-04-29" to "2026-05-04"
    And Gmail has a flight confirmation from "Amsterdam, Netherlands" to "Santiago, Chile"
    When I connect Gmail auto-import
    Then the active planner has 1 imported starting travel
    When I create a trip named "Germany Trip" from "2026-04-29" to "2026-05-04"
    And Gmail checks again
    Then the active planner has 0 imported starting travel

  Scenario: Imported emails do not overwrite matching manual planner items
    Given I have an active trip named "Import Test" with manual starting travel from "Amsterdam" to "Santiago"
    And Gmail has a flight confirmation from "Amsterdam, Netherlands" to "Santiago, Chile"
    When I connect Gmail auto-import
    Then the active planner still has one starting travel item

  Scenario: Disconnecting Gmail stops foreground checks
    Given I open a clean app
    And I create a trip named "Import Test"
    And Gmail has a flight confirmation from "Amsterdam, Netherlands" to "Santiago, Chile"
    When I connect Gmail auto-import
    Then the active planner has one imported starting travel
    When I disconnect Gmail auto-import
    And Gmail has a flight confirmation from "Amsterdam, Netherlands" to "Berlin, Germany"
    And Gmail checks again
    Then the active planner has one imported starting travel
